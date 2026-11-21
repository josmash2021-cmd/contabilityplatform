// Calls the real tRPC procedures (no HTTP, no real database) to check that
// security guards reject bad requests BEFORE anything reaches MySQL.
// DATABASE_URL points at a closed port on purpose: any call that gets past
// the guards fails with a connection error instead of touching real data.
import { beforeAll, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";

process.env.JWT_SECRET ??= "vitest-only-secret-0123456789abcdef";
process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/none";

type Caller = any;
let appRouter: any;

const regularUser = { id: 999_001, email: "user@test.local", role: "user", name: "Test" };

function makeCaller(user?: object, lang: "es" | "en" = "es"): Caller {
  return appRouter.createCaller({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user,
    lang,
  });
}

async function trpcCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof TRPCError ? e.code : "NON_TRPC_ERROR";
  }
}

beforeAll(async () => {
  ({ appRouter } = await import("./router"));
});

const injection = "x' UNION SELECT (SELECT GROUP_CONCAT(email,0x3a,password) FROM users),9-- ";

describe("SQL injection via date inputs is rejected by validation", () => {
  it("sales.stats", async () => {
    expect(await trpcCode(makeCaller(regularUser).sales.stats({ todayDate: injection }))).toBe("BAD_REQUEST");
  });
  it("dashboard.summary", async () => {
    expect(await trpcCode(makeCaller(regularUser).dashboard.summary({ weekStartDate: injection }))).toBe("BAD_REQUEST");
  });
  it("reports.incomeStatement", async () => {
    expect(await trpcCode(makeCaller(regularUser).reports.incomeStatement({ endDate: injection }))).toBe("BAD_REQUEST");
  });
  it("reports.byClient", async () => {
    expect(await trpcCode(makeCaller(regularUser).reports.byClient({ startDate: injection, endDate: "2026-11-30" }))).toBe("BAD_REQUEST");
    expect(await trpcCode(makeCaller(regularUser).reports.byClient({ startDate: "2026-11-01", endDate: injection }))).toBe("BAD_REQUEST");
  });
  it("reports.byService", async () => {
    expect(await trpcCode(makeCaller(regularUser).reports.byService({ startDate: injection, endDate: "2026-11-30" }))).toBe("BAD_REQUEST");
    expect(await trpcCode(makeCaller(regularUser).reports.byService({ startDate: "2026-11-01", endDate: injection }))).toBe("BAD_REQUEST");
  });
  it("still accepts the dates the frontend actually sends", async () => {
    // Passes validation and only fails because there is no database here.
    const code = await trpcCode(
      makeCaller(regularUser).sales.stats({ todayDate: "2026-11-19", weekStartDate: "2026-11-13", monthStartDate: "2026-11-01", tzOffsetHours: -5 }),
    );
    expect(code).not.toBe("BAD_REQUEST");
  }, 30_000);
});

describe("schema-changing endpoints are admin only", () => {
  const ddl: Array<[string, (c: Caller) => Promise<unknown>]> = [
    ["setup.run", (c) => c.setup.run()],
    ["bank.runMigration", (c) => c.bank.runMigration()],
    ["settings.migrate", (c) => c.settings.migrate()],
  ];
  it.each(ddl)("%s rejects anonymous callers", async (_name, call) => {
    expect(await trpcCode(call(makeCaller()))).toBe("UNAUTHORIZED");
  });
  it.each(ddl)("%s rejects non-admin users", async (_name, call) => {
    expect(await trpcCode(call(makeCaller(regularUser)))).toBe("FORBIDDEN");
  });
});

describe("password reset code can't be brute-forced", () => {
  it("allows only 5 guesses per email, even when sent in parallel", async () => {
    const caller = makeCaller();
    const email = `victim-${Date.now()}@test.local`;
    const guesses = Array.from({ length: 30 }, (_, i) =>
      caller.auth.resetPassword({ email, code: String(100000 + i), newPassword: "Hacked123!" }),
    );
    const results = await Promise.allSettled(guesses);
    // Only the first 5 get past the limiter (and then fail on the missing DB);
    // the rest are refused without touching the database.
    const blocked = results.filter(
      (r) => r.status === "fulfilled" && (r.value as any)?.error?.startsWith("Demasiados intentos"),
    );
    const reachedDb = results.filter((r) => r.status === "rejected");
    expect(reachedDb).toHaveLength(5);
    expect(blocked).toHaveLength(25);
  }, 60_000);

  it("answers in English when the client asks for it", async () => {
    const caller = makeCaller(undefined, "en");
    const email = `victim-en-${Date.now()}@test.local`;
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => caller.auth.resetPassword({ email, code: String(300000 + i), newPassword: "Hacked123!" })),
    );
    const blocked = results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<any> | undefined;
    expect(blocked?.value?.error).toBe("Too many attempts. Request a new code.");
  }, 60_000);

  it("verifyCode shares the same attempt budget", async () => {
    const caller = makeCaller();
    const email = `victim2-${Date.now()}@test.local`;
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => caller.auth.verifyCode({ email, code: String(200000 + i) })),
    );
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(5);
  }, 60_000);
});

describe("logout", () => {
  it("clears the session cookie even without a valid session", async () => {
    const resHeaders = new Headers();
    const caller = appRouter.createCaller({ req: new Request("http://localhost/"), resHeaders, user: undefined, lang: "es" });
    await expect(caller.auth.logout()).resolves.toEqual({ success: true });
    expect(resHeaders.get("set-cookie")).toMatch(/local_auth_token=;.*Max-Age=0/);
  });
});

describe("Impuestos: preparer endpoints are admin only", () => {
  const preparer: Array<[string, (c: Caller) => Promise<unknown>]> = [
    ["tax.adminList", (c) => c.tax.adminList()],
    ["tax.adminGet", (c) => c.tax.adminGet({ returnId: 1 })],
    ["tax.adminSetDoc", (c) => c.tax.adminSetDoc({ docId: 1, status: "ok" })],
    ["tax.adminSetStep", (c) => c.tax.adminSetStep({ returnId: 1, step: 2 })],
    ["tax.adminSetResults", (c) => c.tax.adminSetResults({ returnId: 1, fed: { kind: "refund", amount: 100 } })],
    ["tax.adminUpload", (c) => c.tax.adminUpload({ returnId: 1, kind: "final_fed", fileName: "1040.pdf", mimeType: "application/pdf", dataBase64: "JVBERi0xLjQK" })],
    ["tax.adminDeleteDoc", (c) => c.tax.adminDeleteDoc({ docId: 1 })],
    ["tax.adminSendMessage", (c) => c.tax.adminSendMessage({ returnId: 1, body: "hola" })],
    ["tax.adminMarkRead", (c) => c.tax.adminMarkRead({ returnId: 1 })],
  ];
  for (const [name, call] of preparer) {
    it(`${name} rejects a regular user`, async () => {
      expect(await trpcCode(call(makeCaller(regularUser)))).toBe("FORBIDDEN");
    });
  }
  it("tax.current needs a session", async () => {
    expect(await trpcCode(makeCaller().tax.current())).toBe("UNAUTHORIZED");
  });
});

describe("Impuestos: uploads are validated before anything is stored", () => {
  const pdf = Buffer.from("%PDF-1.4 test").toString("base64");
  it("rejects a file type we don't take (e.g. HTML)", async () => {
    const code = await trpcCode(makeCaller(regularUser).tax.upload({ kind: "w2", fileName: "x.html", mimeType: "text/html", dataBase64: pdf }));
    expect(code).toBe("BAD_REQUEST");
  });
  it("rejects a file larger than 10 MB", async () => {
    const big = "A".repeat(Math.ceil((10 * 1024 * 1024 * 4) / 3) + 100);
    expect(await trpcCode(makeCaller(regularUser).tax.upload({ kind: "w2", fileName: "big.pdf", mimeType: "application/pdf", dataBase64: big }))).toBe("BAD_REQUEST");
  });
  it("submit requires both checkboxes", async () => {
    expect(await trpcCode(makeCaller(regularUser).tax.submit({ consent: true, terms: false }))).toBe("BAD_REQUEST");
  });
});

describe("assistant", () => {
  it("needs a session", async () => {
    expect(await trpcCode(makeCaller().assistant.ask({ question: "hola" }))).toBe("UNAUTHORIZED");
  });
  it("rejects empty or very long questions before calling anything", async () => {
    expect(await trpcCode(makeCaller(regularUser).assistant.ask({ question: "   " }))).toBe("BAD_REQUEST");
    expect(await trpcCode(makeCaller(regularUser).assistant.ask({ question: "x".repeat(1001) }))).toBe("BAD_REQUEST");
  });
});
