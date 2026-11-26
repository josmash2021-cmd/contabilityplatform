import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { clearPendingWebhooks, COALESCE_MS, handlePlaidWebhook, plaidWebhookUrl, verifyPlaidWebhook, type PlaidVerificationKey } from "./plaidWebhook";

// A key pair standing in for Plaid's (ES256 = P-256 + SHA-256), and JWTs made the way Plaid makes them.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const other = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwkOf = (k: typeof publicKey): PlaidVerificationKey => ({ ...(k.export({ format: "jwk" }) as PlaidVerificationKey), alg: "ES256", expired_at: null });
const KEY = jwkOf(publicKey);
const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function jwtFor(body: string, opts: { iat?: number; alg?: string; kid?: string; key?: typeof privateKey; sha?: string } = {}) {
  const head = b64url(JSON.stringify({ alg: opts.alg ?? "ES256", kid: opts.kid ?? "kid-1", typ: "JWT" }));
  const pay = b64url(JSON.stringify({ iat: opts.iat ?? Math.floor(Date.now() / 1000), request_body_sha256: opts.sha ?? createHash("sha256").update(body).digest("hex") }));
  const sig = sign("sha256", Buffer.from(`${head}.${pay}`), { key: opts.key ?? privateKey, dsaEncoding: "ieee-p1363" });
  return `${head}.${pay}.${b64url(sig)}`;
}
const keyOf = async (kid: string) => (kid === "kid-1" ? KEY : null);
const BODY = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "item-wf-1" }, null, 2);

describe("Plaid webhook: only Plaid's own, recent, for this exact body", () => {
  it("accepts a webhook signed with Plaid's key for this body", async () => {
    expect(await verifyPlaidWebhook(BODY, jwtFor(BODY), keyOf)).toBe(true);
  });
  it("rejects a body changed after signing", async () => {
    expect(await verifyPlaidWebhook(BODY.replace("item-wf-1", "item-wf-2"), jwtFor(BODY), keyOf)).toBe(false);
  });
  it("rejects another key, an unknown kid, an expired key", async () => {
    expect(await verifyPlaidWebhook(BODY, jwtFor(BODY, { key: other.privateKey }), keyOf)).toBe(false);
    expect(await verifyPlaidWebhook(BODY, jwtFor(BODY, { kid: "kid-9" }), keyOf)).toBe(false);
    expect(await verifyPlaidWebhook(BODY, jwtFor(BODY), async () => ({ ...KEY, expired_at: 1700000000 }))).toBe(false);
  });
  it("rejects one older than 5 minutes, and one from the future", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verifyPlaidWebhook(BODY, jwtFor(BODY, { iat: now - 6 * 60 }), keyOf)).toBe(false);
    expect(await verifyPlaidWebhook(BODY, jwtFor(BODY, { iat: now - 4 * 60 }), keyOf)).toBe(true);
    expect(await verifyPlaidWebhook(BODY, jwtFor(BODY, { iat: now + 10 * 60 }), keyOf)).toBe(false);
  });
  it("rejects no header, garbage, alg none or HS256, and a key lookup that fails", async () => {
    expect(await verifyPlaidWebhook(BODY, undefined, keyOf)).toBe(false);
    expect(await verifyPlaidWebhook(BODY, "not.a.jwt", keyOf)).toBe(false);
    const [, pay, sig] = jwtFor(BODY).split(".");
    expect(await verifyPlaidWebhook(BODY, `${b64url(JSON.stringify({ alg: "none", kid: "kid-1" }))}.${pay}.${sig}`, keyOf)).toBe(false);
    expect(await verifyPlaidWebhook(BODY, jwtFor(BODY, { alg: "HS256" }), keyOf)).toBe(false);
    expect(await verifyPlaidWebhook(BODY, jwtFor(BODY), async () => { throw new Error("plaid down"); })).toBe(false);
  });
});

describe("Plaid webhook: what it does", () => {
  afterEach(() => { clearPendingWebhooks(); vi.useRealTimers(); });
  const deps = (over: Partial<Parameters<typeof handlePlaidWebhook>[2]> = {}) => ({
    keyOf, userOfItem: async (id: string) => (id === "item-wf-1" ? 7 : null), readNow: vi.fn(async () => "done" as const), log: () => {}, ...over,
  });

  it("a spoofed one gets 401 and reads nothing", async () => {
    const d = deps();
    const r = await handlePlaidWebhook(BODY, jwtFor(BODY, { key: other.privateKey }), d);
    expect(r.status).toBe(401);
    expect(d.readNow).not.toHaveBeenCalled();
  });
  it("new movements: reads that user's banks once, a little after a burst of webhooks", async () => {
    vi.useFakeTimers();
    const d = deps();
    for (const code of ["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "SYNC_UPDATES_AVAILABLE"]) {
      const b = BODY.replace("SYNC_UPDATES_AVAILABLE", code);
      expect((await handlePlaidWebhook(b, jwtFor(b), d)).status).toBe(200);
    }
    expect(d.readNow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(COALESCE_MS + 10);
    expect(d.readNow).toHaveBeenCalledTimes(1);
    expect(d.readNow).toHaveBeenCalledWith(7, "item-wf-1");
  });
  it("tries again when the background job is busy", async () => {
    vi.useFakeTimers();
    const readNow = vi.fn().mockResolvedValueOnce("busy").mockResolvedValue("done");
    const d = deps({ readNow });
    await handlePlaidWebhook(BODY, jwtFor(BODY), d);
    await vi.advanceTimersByTimeAsync(COALESCE_MS + 10);
    expect(readNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(20_000 + 10);
    expect(readNow).toHaveBeenCalledTimes(2);
  });
  it("ignores other webhooks and banks that aren't connected here", async () => {
    vi.useFakeTimers();
    const d = deps();
    const auth = JSON.stringify({ webhook_type: "AUTH", webhook_code: "AUTOMATICALLY_VERIFIED", item_id: "item-wf-1" });
    expect((await handlePlaidWebhook(auth, jwtFor(auth), d)).note).toBe("ignored");
    const stranger = BODY.replace("item-wf-1", "item-nobody");
    expect((await handlePlaidWebhook(stranger, jwtFor(stranger), d)).note).toBe("unknown item");
    await vi.advanceTimersByTimeAsync(COALESCE_MS + 10);
    expect(d.readNow).not.toHaveBeenCalled();
  });
  it("a bank error (ITEM ERROR) also reads again, so the app records it", async () => {
    vi.useFakeTimers();
    const d = deps();
    const b = JSON.stringify({ webhook_type: "ITEM", webhook_code: "ERROR", item_id: "item-wf-1", error: { error_code: "ITEM_LOGIN_REQUIRED" } });
    expect((await handlePlaidWebhook(b, jwtFor(b), d)).note).toBe("queued");
  });
});

describe("the webhook address", () => {
  it("is the app's own https address, or the one set for local tests; none on plain http", () => {
    expect(plaidWebhookUrl({ APP_URL: "https://aethelaccountingplatform.com/" } as NodeJS.ProcessEnv)).toBe("https://aethelaccountingplatform.com/api/plaid/webhook");
    expect(plaidWebhookUrl({ APP_URL: "http://127.0.0.1:3457" } as NodeJS.ProcessEnv)).toBeNull();
    expect(plaidWebhookUrl({ APP_URL: "http://127.0.0.1:3457", PLAID_WEBHOOK_URL: "http://127.0.0.1:3457/api/plaid/webhook" } as NodeJS.ProcessEnv)).toBe("http://127.0.0.1:3457/api/plaid/webhook");
    // production has no APP_URL: the live site, with the real Plaid only
    expect(plaidWebhookUrl({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("https://aethelaccountingplatform.com/api/plaid/webhook");
    expect(plaidWebhookUrl({ NODE_ENV: "production", PLAID_BASE_URL: "http://127.0.0.1:4998" } as NodeJS.ProcessEnv)).toBeNull();
    expect(plaidWebhookUrl({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
