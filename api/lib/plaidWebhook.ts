// ── Plaid's webhooks: Plaid tells the app as soon as a bank has something new (owner, 2026-11-26: "se ve dinero viejo") ──
// Plaid brings each bank's movements and balances from 1 to 4 times a day; until now the app only asked Plaid every
// few minutes and got Plaid's last copy. With the webhook, Plaid posts to /api/plaid/webhook right after it brings
// something new from a bank, and the app reads that user's banks at once (api/bank-router.ts syncUserBanksNow).
// Every webhook is verified before anything happens (Plaid's Plaid-Verification JWT: ES256 with Plaid's own key
// for its kid, issued within the last 5 minutes, for this exact body's SHA-256). Anything else gets 401 and does
// nothing. A webhook only ever makes the app read from Plaid; it never carries data the app trusts.
import { createHash, createPublicKey, timingSafeEqual, verify as verifySignature } from "node:crypto";

export const PLAID_WEBHOOK_PATH = "/api/plaid/webhook";

/** The live site (the same address api/boot.ts allows in CORS). */
const LIVE_SITE = "https://aethelaccountingplatform.com";

/**
 * Where Plaid posts: PLAID_WEBHOOK_URL (local tests), else APP_URL when it's https, else (production, which has no
 * APP_URL) the live site, but only with the real Plaid: local servers point PLAID_BASE_URL at a fake one.
 * Null: no webhooks (the background job then keeps asking every 3 minutes).
 */
export function plaidWebhookUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const own = env.PLAID_WEBHOOK_URL?.trim();
  if (own) return own;
  const app = env.APP_URL?.trim().replace(/\/+$/, "");
  if (app && /^https:\/\/[^/]+/.test(app)) return app + PLAID_WEBHOOK_PATH;
  if (env.NODE_ENV === "production" && !env.PLAID_BASE_URL) return LIVE_SITE + PLAID_WEBHOOK_PATH;
  return null;
}

/** Plaid's public key for a kid, as /webhook_verification_key/get returns it (a P-256 JWK). */
export type PlaidVerificationKey = { kty?: string; crv?: string; x?: string; y?: string; alg?: string; expired_at?: number | null };
export type KeySource = (kid: string) => Promise<PlaidVerificationKey | null>;

/** How old a webhook may be (Plaid's guidance: reject anything issued more than 5 minutes ago). */
export const MAX_AGE_S = 5 * 60;

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** True when the Plaid-Verification JWT is Plaid's, recent, and was made for this exact body. Never throws. */
export async function verifyPlaidWebhook(rawBody: string, jwt: string | null | undefined, keyOf: KeySource, nowMs = Date.now()): Promise<boolean> {
  if (!jwt || typeof jwt !== "string") return false;
  const parts = jwt.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) return false;
  let header: { alg?: unknown; kid?: unknown };
  let payload: { iat?: unknown; request_body_sha256?: unknown };
  try {
    header = JSON.parse(fromB64url(parts[0]).toString("utf8"));
    payload = JSON.parse(fromB64url(parts[1]).toString("utf8"));
  } catch {
    return false;
  }
  // Only ES256 (never "none" or a key the sender chose)
  if (header.alg !== "ES256" || typeof header.kid !== "string" || !header.kid) return false;
  let jwk: PlaidVerificationKey | null;
  try { jwk = await keyOf(header.kid); } catch { return false; }
  if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || jwk.expired_at) return false;
  try {
    const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y }, format: "jwk" });
    const ok = verifySignature("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: "ieee-p1363" }, fromB64url(parts[2]));
    if (!ok) return false;
  } catch {
    return false;
  }
  if (typeof payload.iat !== "number" || nowMs / 1000 - payload.iat > MAX_AGE_S || payload.iat - nowMs / 1000 > 60) return false;
  if (typeof payload.request_body_sha256 !== "string") return false;
  const want = Buffer.from(createHash("sha256").update(rawBody, "utf8").digest("hex"));
  const got = Buffer.from(payload.request_body_sha256);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Plaid's keys by kid, kept a day (Plaid rotates them rarely; an unknown kid is asked for once). */
export function cachedKeys(fetchKey: KeySource, ttlMs = 24 * 60 * 60 * 1000): KeySource {
  const cache = new Map<string, { key: PlaidVerificationKey | null; at: number }>();
  return async (kid) => {
    const hit = cache.get(kid);
    if (hit && Date.now() - hit.at < (hit.key ? ttlMs : 60_000)) return hit.key;
    const key = await fetchKey(kid);
    cache.set(kid, { key, at: Date.now() });
    return key;
  };
}

/** The webhooks that mean "this bank has something new" (or changed state): the app reads that user's banks. */
const READ_AGAIN: Record<string, ReadonlySet<string>> = {
  TRANSACTIONS: new Set(["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE", "TRANSACTIONS_REMOVED"]),
  // ERROR (e.g. ITEM_LOGIN_REQUIRED), LOGIN_REPAIRED, PENDING_EXPIRATION...: reading again records the new state
  ITEM: new Set(["ERROR", "LOGIN_REPAIRED", "PENDING_EXPIRATION", "PENDING_DISCONNECT", "NEW_ACCOUNTS_AVAILABLE"]),
};

export type WebhookDeps = {
  keyOf: KeySource;
  /** The user whose bank connection this is (null: not ours, or disconnected). */
  userOfItem: (itemId: string) => Promise<number | null>;
  /** Reads that user's banks now. "busy": the background job is running; try again in a moment. */
  readNow: (userId: number, itemId: string) => Promise<"done" | "busy">;
  log?: (line: string) => void;
};

type Pending = { timer: ReturnType<typeof setTimeout>; tries: number };
const pending = new Map<string, Pending>();
/** Plaid often sends a few webhooks in a row for one bank: one read a little after the last one. */
export const COALESCE_MS = 8000;
const RETRY_MS = 20_000;
const MAX_TRIES = 6;

function schedule(itemId: string, userId: number, deps: WebhookDeps, delay = COALESCE_MS, tries = 0) {
  const prev = pending.get(itemId);
  if (prev) clearTimeout(prev.timer);
  const timer = setTimeout(async () => {
    pending.delete(itemId);
    let out: "done" | "busy" = "done";
    try { out = await deps.readNow(userId, itemId); } catch (e: unknown) {
      (deps.log ?? console.error)(`[plaid-webhook] reading bank ${itemId} (user ${userId}) failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (out === "busy" && tries + 1 < MAX_TRIES) schedule(itemId, userId, deps, RETRY_MS, tries + 1);
  }, delay);
  timer.unref?.();
  pending.set(itemId, { timer, tries });
}

/** Handles one webhook: verify, then (for the ones that matter) read that user's banks soon. Never throws. */
export async function handlePlaidWebhook(rawBody: string, jwt: string | null | undefined, deps: WebhookDeps): Promise<{ status: 200 | 400 | 401; note: string }> {
  const log = deps.log ?? console.log;
  if (!(await verifyPlaidWebhook(rawBody, jwt, deps.keyOf))) {
    log("[plaid-webhook] rejected: not verified");
    return { status: 401, note: "not verified" };
  }
  let body: { webhook_type?: unknown; webhook_code?: unknown; item_id?: unknown };
  try { body = JSON.parse(rawBody); } catch { return { status: 400, note: "bad json" }; }
  const type = String(body.webhook_type ?? ""), code = String(body.webhook_code ?? ""), itemId = typeof body.item_id === "string" ? body.item_id : "";
  if (!itemId || !READ_AGAIN[type]?.has(code)) {
    log(`[plaid-webhook] ${type} ${code}: nothing to do`);
    return { status: 200, note: "ignored" };
  }
  let userId: number | null = null;
  try { userId = await deps.userOfItem(itemId); } catch { userId = null; }
  if (!userId) {
    log(`[plaid-webhook] ${type} ${code} for a bank that isn't connected here`);
    return { status: 200, note: "unknown item" };
  }
  log(`[plaid-webhook] ${type} ${code}: reading bank ${itemId} (user ${userId})`);
  schedule(itemId, userId, deps);
  return { status: 200, note: "queued" };
}

/** For tests: forget the pending reads. */
export function clearPendingWebhooks() {
  for (const p of pending.values()) clearTimeout(p.timer);
  pending.clear();
}
