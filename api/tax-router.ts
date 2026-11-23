// ── Impuestos ──
// The client uploads documents from the phone, answers a few questions and sends
// everything to our preparers (admins). Preparers review each document, move the
// return through its steps, upload the finished returns and talk with the client.
// Federal + Alabama. Preparation is free for the client. Files are encrypted (taxCrypto).
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { isMissingTable } from "./lib/dbErrors";
import { taxDocuments, taxMessages, taxReturns, users } from "@db/schema";
import { accountMode } from "./lib/plans";
import { contextHas, getPlanContext } from "./lib/planAccess";
import { msg, type Lang } from "./lib/i18n";
import { decryptTaxFile, encryptTaxFile, hasTaxKey } from "./lib/taxCrypto";
import { decodeSignature, sha256, signatureId, signedPdf } from "./lib/taxSign";
import { sealKey } from "./lib/taxSeal";
import { utcDate } from "./lib/support";
import { sendMail } from "./lib/mailer";
import { taxStepMail } from "./lib/taxMail";
import { lockTax, maskEmail, requireTaxUnlocked, sendTaxCode, taxGateOn, taxUnlocked, verifyTaxCode } from "./lib/taxGate";
import {
  DRAFT_STEP, PREPARER_DOC_KINDS, TAX_FILE_TYPES, TAX_MAX_FILE_BYTES, TAX_MAX_FILES_PER_KIND, TAX_QUESTIONS, TAX_STEP_COUNT,
  ID_TYPES, PAPER_8879, canSend, currentTaxYear, filingDeadline, isClientDocKind, missingToSend, sameName,
  type TaxDocMeta, type TaxMessage, type TaxMode, type TaxReturnMeta, type TaxReturnRow,
} from "@contracts/taxRules";

type Db = ReturnType<typeof getDb>;
type CtxUser = { id: number | string; role?: string | null; modePreference?: string | null; createdAt?: Date | string | null; name?: string | null };

/** Steps from which the return is with the IRS: documents can't change anymore. */
const FILED_STEP = 4;
/** "Revísala y fírmala": the preparer sent the finished return for the client to check. */
const SIGN_STEP = 3;

// ── Tables (created on first use; additive, never touches other tables) ──
let tablesReady: Promise<void> | null = null;
export function ensureTaxTables(db: Db): Promise<void> {
  tablesReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS taxReturns (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        taxYear INT NOT NULL,
        mode ENUM('business', 'personal') NOT NULL,
        state VARCHAR(2) NOT NULL DEFAULT 'AL',
        step INT NOT NULL DEFAULT -1,
        stepDates JSON,
        answers JSON,
        filingStatus VARCHAR(40),
        fedResult JSON,
        stateResult JSON,
        consentAt TIMESTAMP NULL,
        submittedAt TIMESTAMP NULL,
        approvedAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        updatedAt TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE INDEX taxReturns_user_year_mode (userId, taxYear, mode)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS taxDocuments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        returnId BIGINT UNSIGNED NOT NULL,
        userId BIGINT UNSIGNED NOT NULL,
        kind VARCHAR(30) NOT NULL,
        source ENUM('client', 'preparer') NOT NULL DEFAULT 'client',
        fileName VARCHAR(255) NOT NULL,
        mimeType VARCHAR(100) NOT NULL,
        size INT NOT NULL,
        data LONGBLOB NOT NULL,
        status ENUM('pending', 'ok', 'redo') NOT NULL DEFAULT 'pending',
        note TEXT,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX taxDocuments_returnId_idx (returnId)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS taxMessages (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        returnId BIGINT UNSIGNED NOT NULL,
        fromRole ENUM('client', 'preparer') NOT NULL,
        authorName VARCHAR(255),
        body TEXT NOT NULL,
        readAt TIMESTAMP NULL,
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX taxMessages_returnId_idx (returnId)
      )
    `);
    // Our own e-signature of the 8879: the drawn signature (encrypted) and what proves who signed what, when.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS taxSignatures (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        returnId BIGINT UNSIGNED NOT NULL,
        userId BIGINT UNSIGNED NOT NULL,
        name VARCHAR(160) NOT NULL,
        signature LONGBLOB NOT NULL,
        signedAt TIMESTAMP NOT NULL,
        ip VARCHAR(80),
        userAgent VARCHAR(300),
        docId BIGINT UNSIGNED,
        docSha256 CHAR(64),
        createdAt TIMESTAMP DEFAULT NOW() NOT NULL,
        INDEX taxSignatures_returnId_idx (returnId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // Signing in person (IRS Pub. 1345): the preparer inspected a government photo ID with the client in front
    // of them and recorded name, SSN/ITIN, address and date of birth (encrypted in `data`). While `openUntil` is
    // ahead, the client can e-sign the 8879 in the app (the preparer is with them).
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS taxIdChecks (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        returnId BIGINT UNSIGNED NOT NULL,
        userId BIGINT UNSIGNED NOT NULL,
        checkedBy BIGINT UNSIGNED NOT NULL,
        checkedByName VARCHAR(160),
        idType VARCHAR(30) NOT NULL,
        taxIdKind VARCHAR(4) NOT NULL,
        taxIdLast4 CHAR(4) NOT NULL,
        data LONGBLOB NOT NULL,
        checkedAt TIMESTAMP DEFAULT NOW() NOT NULL,
        openUntil TIMESTAMP NULL,
        INDEX taxIdChecks_returnId_idx (returnId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // Added later (additive, nullable): when the client approved the finished return ("Revisa y firma"), and the
    // client's full name as on their ID (the preparer sets it; the client types it the same to sign).
    const addColumn = (q: ReturnType<typeof sql>) => db.execute(q).catch((e: unknown) => {
      if (!/Duplicate column|ER_DUP_FIELDNAME|1060/i.test(e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? "")}` : String(e))) throw e;
    });
    await addColumn(sql`ALTER TABLE taxReturns ADD COLUMN approvedAt TIMESTAMP NULL`);
    await addColumn(sql`ALTER TABLE taxReturns ADD COLUMN legalName VARCHAR(160) NULL`);
    // The client's language, for the step emails (saved when they send the return and sign).
    await addColumn(sql`ALTER TABLE taxReturns ADD COLUMN lang VARCHAR(2) NULL`);
  })().catch((e) => {
    tablesReady = null;
    throw e;
  });
  return tablesReady;
}

/** Deletes every tax return, document and message of a user (used when an account is deleted). */
export async function deleteUserTaxData(db: Db, userId: number): Promise<void> {
  try {
    const rets = await db.select({ id: taxReturns.id }).from(taxReturns).where(eq(taxReturns.userId, userId));
    const ids = rets.map((r: { id: number }) => r.id);
    if (ids.length) {
      await db.delete(taxDocuments).where(inArray(taxDocuments.returnId, ids));
      await db.delete(taxMessages).where(inArray(taxMessages.returnId, ids));
      await db.delete(taxReturns).where(inArray(taxReturns.id, ids));
    }
    await db.delete(taxDocuments).where(eq(taxDocuments.userId, userId));
  } catch (e: unknown) {
    // The tables don't exist until someone uses Impuestos: nothing to delete then.
    if (!isMissingTable(e)) throw e;
  }
}

// ── Who can use Impuestos ──
/** Personal: everyone (Básico is free). Business: Pro and Negocio, and the free trial. */
export async function taxAccess(db: Db, user: CtxUser): Promise<{ allowed: boolean }> {
  return { allowed: contextHas(await getPlanContext(db, user), "taxes") };
}

async function requireAccess(db: Db, user: CtxUser, lang: Lang) {
  if (!(await taxAccess(db, user)).allowed) throw new TRPCError({ code: "FORBIDDEN", message: msg(lang, "taxNoPlan") });
}

// ── Files ──
/** Checks the first bytes, so a file is what its type says (no HTML or scripts dressed up as a PDF). */
export function sniffTaxFile(buf: Buffer, mimeType: string): boolean {
  const head = (n: number) => buf.subarray(0, n);
  switch (mimeType) {
    case "application/pdf": return head(5).toString("latin1") === "%PDF-";
    case "image/jpeg": return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case "image/png": return head(8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp": return head(4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP";
    case "image/heic":
    case "image/heif": return buf.subarray(4, 8).toString("latin1") === "ftyp";
    default: return false;
  }
}

const fileInput = {
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(TAX_FILE_TYPES),
  // base64 of at most TAX_MAX_FILE_BYTES
  dataBase64: z.string().min(8).max(Math.ceil((TAX_MAX_FILE_BYTES * 4) / 3) + 8),
};

function decodeFile(input: { fileName: string; mimeType: (typeof TAX_FILE_TYPES)[number]; dataBase64: string }, lang: Lang) {
  const buf = Buffer.from(input.dataBase64, "base64");
  if (buf.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: msg(lang, "taxBadFile") });
  if (buf.length > TAX_MAX_FILE_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: msg(lang, "taxTooBig") });
  if (!sniffTaxFile(buf, input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: msg(lang, "taxBadFile") });
  if (!hasTaxKey()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: msg(lang, "taxNoKey") });
  // Keep only a safe display name: no paths, no control characters.
  const printable = Array.from(input.fileName).filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join("");
  const fileName = printable.replace(/[\\/]/g, "_").slice(0, 200) || "documento";
  return { buf, fileName };
}

const docMeta = {
  id: taxDocuments.id, kind: taxDocuments.kind, source: taxDocuments.source, fileName: taxDocuments.fileName,
  mimeType: taxDocuments.mimeType, size: taxDocuments.size, status: taxDocuments.status, note: taxDocuments.note, createdAt: taxDocuments.createdAt,
};
const retMeta = {
  id: taxReturns.id, userId: taxReturns.userId, taxYear: taxReturns.taxYear, mode: taxReturns.mode, state: taxReturns.state, step: taxReturns.step,
  stepDates: taxReturns.stepDates, answers: taxReturns.answers, filingStatus: taxReturns.filingStatus, fedResult: taxReturns.fedResult,
  stateResult: taxReturns.stateResult, submittedAt: taxReturns.submittedAt, updatedAt: taxReturns.updatedAt,
  // Not in db/schema.ts (added by ensureTaxTables).
  approvedAt: sql<Date | string | null>`approvedAt`,
  legalName: sql<string | null>`legalName`,
};

function modeOf(user: CtxUser): TaxMode {
  return accountMode(user.modePreference);
}

async function findReturn(db: Db, userId: number, mode: TaxMode, year: number): Promise<TaxReturnMeta | null> {
  return (await db.select(retMeta).from(taxReturns)
    .where(and(eq(taxReturns.userId, userId), eq(taxReturns.mode, mode), eq(taxReturns.taxYear, year))).limit(1))[0] ?? null;
}

async function getOrCreateReturn(db: Db, userId: number, mode: TaxMode, year: number): Promise<TaxReturnMeta> {
  const found = await findReturn(db, userId, mode, year);
  if (found) return found;
  await db.insert(taxReturns).values({ userId, mode, taxYear: year, state: "AL", step: DRAFT_STEP, stepDates: [], answers: {} })
    // Two uploads at once may both try to create it: the unique index keeps one.
    .catch((e: unknown) => { if (!/Duplicate entry|ER_DUP_ENTRY/i.test(e instanceof Error ? e.message : String(e))) throw e; });
  return (await findReturn(db, userId, mode, year))!;
}

async function filesByKind(db: Db, returnId: number): Promise<Record<string, number>> {
  const rows = await db.select({ kind: taxDocuments.kind, n: sql<number>`count(*)` }).from(taxDocuments)
    .where(and(eq(taxDocuments.returnId, returnId), eq(taxDocuments.source, "client"))).groupBy(taxDocuments.kind);
  return Object.fromEntries(rows.map((r: { kind: string; n: number }) => [r.kind, Number(r.n)]));
}

/** Moves the return to the top of the preparer's list when the client does something. */
async function touch(db: Db, returnId: number) {
  await db.update(taxReturns).set({ updatedAt: new Date() }).where(eq(taxReturns.id, returnId));
}

function stepDatesWith(dates: (string | null)[] | null | undefined, step: number): (string | null)[] {
  const out = Array.from({ length: TAX_STEP_COUNT }, (_, i) => (dates?.[i] ?? null));
  for (let i = 0; i < TAX_STEP_COUNT; i++) {
    if (i > step) out[i] = null;
    else if (!out[i]) out[i] = new Date().toISOString();
  }
  return out;
}

const resultInput = z.object({ kind: z.enum(["refund", "owe"]), amount: z.number().min(0).max(10_000_000) }).nullable().optional();

type IdCheckRow = { id: number; idType: string; taxIdKind: string; taxIdLast4: string; checkedByName: string | null; checkedAt: Date | string; openUntil: Date | string | null; open: number };

/** The latest in-person ID check of a return, and whether signing is open now (times as ISO, UTC). */
async function latestIdCheck(db: Db, returnId: number): Promise<{ idType: string; taxIdKind: string; taxIdLast4: string; checkedByName: string | null; checkedAt: string; openUntil: string | null; open: boolean } | null> {
  const res = (await db.execute(sql`SELECT id, idType, taxIdKind, taxIdLast4, checkedByName, checkedAt, openUntil, (openUntil IS NOT NULL AND openUntil > NOW()) AS open
    FROM taxIdChecks WHERE returnId = ${returnId} ORDER BY id DESC LIMIT 1`)) as unknown as [IdCheckRow[]] | IdCheckRow[];
  const row = ((Array.isArray(res[0]) ? res[0] : res) as IdCheckRow[])[0];
  if (!row) return null;
  const iso = (v: Date | string | null) => utcDate(v)?.toISOString() ?? null;
  return { idType: row.idType, taxIdKind: row.taxIdKind, taxIdLast4: row.taxIdLast4, checkedByName: row.checkedByName, checkedAt: iso(row.checkedAt)!, openUntil: iso(row.openUntil), open: Number(row.open) === 1 };
}

/** "Tu preparador": the first name of whoever prepares the returns (the app's first admin). */
async function preparerFirstName(db: Db): Promise<string | null> {
  try {
    const res = (await db.execute(sql`SELECT name FROM users WHERE role = 'admin' AND name IS NOT NULL AND name <> '' ORDER BY id LIMIT 1`)) as unknown as [Array<{ name: string }>] | Array<{ name: string }>;
    const rows = (Array.isArray(res[0]) ? res[0] : res) as Array<{ name: string }>;
    return rows[0]?.name?.trim().split(/\s+/)[0] || null;
  } catch { return null; }
}

/**
 * The client's email for the step the return just reached ("Tu declaración está lista para firmar"…), in their
 * language. Never throws and never holds the request (callers don't wait for it).
 */
async function notifyStep(db: Db, returnId: number, step: number): Promise<void> {
  try {
    const r = (await db.select({
      mode: taxReturns.mode, taxYear: taxReturns.taxYear, fed: taxReturns.fedResult, st: taxReturns.stateResult,
      lang: sql<string | null>`lang`, legalName: sql<string | null>`legalName`, email: users.email, name: users.name,
    }).from(taxReturns).leftJoin(users, eq(users.id, taxReturns.userId)).where(eq(taxReturns.id, returnId)).limit(1))[0];
    if (!r?.email) return;
    const lang = r.lang === "en" ? "en" : "es";
    const kinds = [r.fed, r.st].map((x) => (typeof x === "string" ? (JSON.parse(x) as { kind?: string } | null) : (x as { kind?: string } | null))?.kind);
    const due = new Date(`${filingDeadline(r.taxYear)}T12:00:00Z`).toLocaleDateString(lang === "en" ? "en-US" : "es-US", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
    const mail = taxStepMail(step, {
      to: r.email, lang, firstName: (r.name || r.legalName || "").trim().split(/\s+/)[0] ?? "", preparer: (await preparerFirstName(db)) ?? (lang === "en" ? "Your preparer" : "Tu preparador"),
      mode: r.mode, refund: kinds.includes("refund"), owe: kinds.includes("owe"), deadline: due,
    });
    if (mail) await sendMail(mail);
  } catch (e) {
    console.error("[tax] step email:", e instanceof Error ? e.message : e);
  }
}

/** A real calendar date (YYYY-MM-DD) for someone between 14 and 120 years old. */
function realBirthDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return false;
  const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600_000);
  return age >= 14 && age <= 120;
}

/** Client calls that read or change the return and its documents: only with Impuestos open in this tab (lib/taxGate). */
const unlockedQuery = authedQuery.use(async ({ ctx, next }) => {
  await requireTaxUnlocked(getDb(), Number(ctx.user.id), ctx.req, ctx.lang);
  return next();
});

export const taxRouter = createRouter({
  // ── Client ──
  /** Everything the Impuestos page shows for this year, plus the years before. */
  current: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const access = await taxAccess(db, ctx.user);
    const mode = modeOf(ctx.user);
    const year = currentTaxYear();
    const base = { access, mode, year, keyReady: hasTaxKey(), gate: taxGateOn(), locked: false, maskedEmail: null as string | null, preparerName: null as string | null, signName: null as string | null, inPerson: null as { open: boolean; until: string | null } | null };
    const empty = { ret: null as TaxReturnMeta | null, docs: [] as TaxDocMeta[], messages: [] as TaxMessage[], past: [] as TaxReturnMeta[], missing: null };
    if (!access.allowed) return { ...base, ...empty };
    const userId = Number(ctx.user.id);
    // "Primero, confirma que eres tú": nothing of the return until this tab has the code.
    if (!(await taxUnlocked(db, userId, ctx.req))) return { ...base, ...empty, locked: true, maskedEmail: maskEmail(ctx.user.email || "") };
    await ensureTaxTables(db);
    const ret = await findReturn(db, userId, mode, year);
    const docs: TaxDocMeta[] = ret ? await db.select(docMeta).from(taxDocuments).where(eq(taxDocuments.returnId, ret.id)).orderBy(taxDocuments.createdAt) : [];
    const messages: TaxMessage[] = ret ? await db.select().from(taxMessages).where(eq(taxMessages.returnId, ret.id)).orderBy(taxMessages.createdAt) : [];
    const past: TaxReturnMeta[] = await db.select(retMeta).from(taxReturns)
      .where(and(eq(taxReturns.userId, userId), eq(taxReturns.mode, mode), lt(taxReturns.taxYear, year))).orderBy(desc(taxReturns.taxYear));
    const counts: Record<string, number> = {};
    for (const d of docs) if (d.source === "client") counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    // "Tu preparador": the first name of whoever prepares the returns (the app's admin), not a second "Tu preparador".
    const preparerName = await preparerFirstName(db);
    // The name to type to sign: the one the preparer confirmed from the ID, else the account's.
    const signName = ret?.legalName?.trim() || ctx.user.name?.trim() || null;
    // Signing in the office: open while the preparer, with the client and their photo ID, has opened it.
    const check = ret && ret.step === SIGN_STEP && !ret.approvedAt ? await latestIdCheck(db, ret.id) : null;
    const inPerson = check ? { open: check.open, until: check.open ? check.openUntil : null } : null;
    return { ...base, preparerName, signName, inPerson, ret, docs, messages, past, missing: missingToSend(mode, ret?.answers ?? {}, counts) };
  }),

  /** What the home screens remind about, without the documents (so it works while Impuestos is closed). */
  reminders: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    if (!(await taxAccess(db, ctx.user)).allowed) return { allowed: false, step: null as number | null, redo: 0, needsDocs: false };
    await ensureTaxTables(db);
    const userId = Number(ctx.user.id);
    const mode = modeOf(ctx.user);
    const ret = await findReturn(db, userId, mode, currentTaxYear());
    type DocState = { kind: string; source: string; status: string | null };
    const docs: DocState[] = ret ? await db.select({ kind: taxDocuments.kind, source: taxDocuments.source, status: taxDocuments.status }).from(taxDocuments).where(eq(taxDocuments.returnId, ret.id)) : [];
    const counts: Record<string, number> = {};
    for (const d of docs) if (d.source === "client") counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    const missing = missingToSend(mode, ret?.answers ?? {}, counts);
    return {
      allowed: true, step: ret?.step ?? DRAFT_STEP,
      redo: docs.filter((d) => d.source === "client" && d.status === "redo").length,
      needsDocs: missing.docs.length > 0 || !!missing.income,
    };
  }),

  /** "Mandarme el código": a 6-digit code to the account's email. */
  sendCode: authedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await requireAccess(db, ctx.user, ctx.lang);
    return sendTaxCode(db, ctx.user, ctx.lang);
  }),

  /** The code: when it's right, the key that keeps Impuestos open in this tab for 30 minutes. */
  verifyCode: authedQuery.input(z.object({ code: z.string().trim().min(1).max(12) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await requireAccess(db, ctx.user, ctx.lang);
    return verifyTaxCode(db, ctx.user, input.code, ctx.lang);
  }),

  /** "Cerrar Impuestos": this tab's key stops working. */
  lock: authedQuery.mutation(async ({ ctx }) => {
    await lockTax(getDb(), Number(ctx.user.id), ctx.req);
    return { ok: true };
  }),

  /** A past year's return: its summary and documents. */
  pastYear: unlockedQuery.input(z.object({ returnId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = getDb();
    await ensureTaxTables(db);
    const ret: TaxReturnMeta | undefined = (await db.select(retMeta).from(taxReturns).where(and(eq(taxReturns.id, input.returnId), eq(taxReturns.userId, Number(ctx.user.id)))).limit(1))[0];
    if (!ret) throw new TRPCError({ code: "NOT_FOUND", message: msg(ctx.lang, "taxNotFound") });
    const docs: TaxDocMeta[] = await db.select(docMeta).from(taxDocuments).where(eq(taxDocuments.returnId, ret.id)).orderBy(taxDocuments.createdAt);
    return { ret, docs };
  }),

  saveAnswers: unlockedQuery
    .input(z.object({ answers: z.record(z.string().max(20), z.boolean().nullable()) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await requireAccess(db, ctx.user, ctx.lang);
      await ensureTaxTables(db);
      const mode = modeOf(ctx.user);
      const allowed = new Set(TAX_QUESTIONS[mode]);
      const ret = await getOrCreateReturn(db, Number(ctx.user.id), mode, currentTaxYear());
      if (ret.step !== DRAFT_STEP) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxLocked") });
      const answers = { ...(ret.answers ?? {}) };
      for (const [k, v] of Object.entries(input.answers)) if (allowed.has(k)) answers[k] = v;
      await db.update(taxReturns).set({ answers }).where(eq(taxReturns.id, ret.id));
      return { answers };
    }),

  upload: unlockedQuery
    .input(z.object({ kind: z.string().max(30), ...fileInput }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await requireAccess(db, ctx.user, ctx.lang);
      const mode = modeOf(ctx.user);
      const paper = input.kind === PAPER_8879;
      if (!paper && !isClientDocKind(mode, input.kind)) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxBadFile") });
      const { buf, fileName } = decodeFile(input, ctx.lang);
      await ensureTaxTables(db);
      const userId = Number(ctx.user.id);
      const ret = await getOrCreateReturn(db, userId, mode, currentTaxYear());
      if (ret.step >= FILED_STEP) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxLocked") });
      // The hand-signed 8879 (signing on paper): only while the return waits for the signature.
      if (paper && (ret.step !== SIGN_STEP || ret.approvedAt)) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxPaperNotNow") });
      if (((await filesByKind(db, ret.id))[input.kind] ?? 0) >= TAX_MAX_FILES_PER_KIND) {
        throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxTooMany") });
      }
      await db.insert(taxDocuments).values({
        returnId: ret.id, userId, kind: input.kind, source: "client", fileName, mimeType: input.mimeType, size: buf.length, data: encryptTaxFile(buf),
      });
      await touch(db, ret.id);
      return { ok: true };
    }),

  /** Removes a file the client uploaded, unless the preparer already approved it. */
  deleteDoc: unlockedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await ensureTaxTables(db);
    const userId = Number(ctx.user.id);
    const doc = (await db.select({ id: taxDocuments.id, status: taxDocuments.status, returnId: taxDocuments.returnId }).from(taxDocuments)
      .where(and(eq(taxDocuments.id, input.id), eq(taxDocuments.userId, userId), eq(taxDocuments.source, "client"))).limit(1))[0];
    if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: msg(ctx.lang, "taxNotFound") });
    const ret = (await db.select({ step: taxReturns.step }).from(taxReturns).where(eq(taxReturns.id, doc.returnId)).limit(1))[0];
    if (doc.status === "ok" || (ret && ret.step >= FILED_STEP)) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxLocked") });
    await db.delete(taxDocuments).where(eq(taxDocuments.id, doc.id));
    return { ok: true };
  }),

  /** One file, decrypted. Its owner or a preparer only. */
  file: unlockedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = getDb();
    await ensureTaxTables(db);
    const isAdmin = ctx.user.role === "admin";
    const where = isAdmin ? eq(taxDocuments.id, input.id) : and(eq(taxDocuments.id, input.id), eq(taxDocuments.userId, Number(ctx.user.id)));
    const doc = (await db.select().from(taxDocuments).where(where).limit(1))[0];
    if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: msg(ctx.lang, "taxNotFound") });
    return { fileName: doc.fileName, mimeType: doc.mimeType, dataBase64: decryptTaxFile(Buffer.from(doc.data)).toString("base64") };
  }),

  /** Sends the documents to the preparer. */
  submit: unlockedQuery
    .input(z.object({ consent: z.literal(true), terms: z.literal(true) }))
    .mutation(async ({ ctx }) => {
      const db = getDb();
      await requireAccess(db, ctx.user, ctx.lang);
      await ensureTaxTables(db);
      const mode = modeOf(ctx.user);
      const ret = await findReturn(db, Number(ctx.user.id), mode, currentTaxYear());
      if (!ret || ret.step !== DRAFT_STEP) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxNotReady") });
      if (!canSend(missingToSend(mode, ret.answers ?? {}, await filesByKind(db, ret.id)))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxNotReady") });
      }
      const now = new Date();
      await db.update(taxReturns).set({ step: 0, stepDates: stepDatesWith([], 0), consentAt: now, submittedAt: now }).where(eq(taxReturns.id, ret.id));
      await db.execute(sql`UPDATE taxReturns SET lang = ${ctx.lang === "en" ? "en" : "es"} WHERE id = ${ret.id}`);
      void notifyStep(db, ret.id, 0);
      return { ok: true };
    }),

  /**
   * "Firmar y autorizar el envío": our own e-signature of the 8879 at "Revisa y firma". The typed name must be
   * the full name on the return. Keeps the drawn signature (encrypted), the name, time, IP, device and the
   * SHA-256 of the 8879 the client had; adds the signed 8879 (the preparer's file with the signature, name, date
   * and time on its "Your signature" line, plus a signature page) to the return and tells the preparer.
   */
  sign: unlockedQuery
    .input(z.object({
      name: z.string().trim().min(3).max(120), signature: z.string().max(420_000), agree: z.literal(true),
      // The 8879 the client saw, and where its "Your signature" line is (found by the page in the PDF's text).
      docId: z.number().int().positive().optional(),
      spot: z.object({
        page: z.number().int().min(1).max(50), labelX: z.number().finite(), x: z.number().finite(), y: z.number().finite(),
        w: z.number().finite(), dateX: z.number().finite().nullable(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await requireAccess(db, ctx.user, ctx.lang);
      await ensureTaxTables(db);
      const userId = Number(ctx.user.id);
      const year = currentTaxYear();
      const ret = await findReturn(db, userId, modeOf(ctx.user), year);
      if (!ret || ret.step !== SIGN_STEP) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxNotReady") });
      if (ret.approvedAt) return { ok: true, already: true };
      // Signing in the app is the in-person kind (IRS Pub. 1345): the preparer checked the photo ID and is with them.
      const check = await latestIdCheck(db, ret.id);
      if (!check?.open) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxNeedInPerson") });
      const legalName = ret.legalName?.trim() || ctx.user.name?.trim() || "";
      if (legalName && !sameName(input.name, legalName)) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxNameMismatch") });
      const png = decodeSignature(input.signature);
      if (!png) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxBadSignature") });
      if (!hasTaxKey()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: msg(ctx.lang, "taxNoKey") });
      // The 8879 the client had in front of them (else the newest one).
      const f8879 = (await db.select({ id: taxDocuments.id, data: taxDocuments.data, mimeType: taxDocuments.mimeType, fileName: taxDocuments.fileName })
        .from(taxDocuments)
        .where(and(eq(taxDocuments.returnId, ret.id), eq(taxDocuments.source, "preparer"), eq(taxDocuments.kind, "f8879"),
          input.docId ? eq(taxDocuments.id, input.docId) : undefined))
        .orderBy(desc(taxDocuments.createdAt), desc(taxDocuments.id)).limit(1))[0];
      const original = f8879 ? decryptTaxFile(Buffer.from(f8879.data)) : null;
      // Whole seconds: the time on the PDF, in taxSignatures and in the signature ID are the same.
      const signedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
      const ip = (ctx.req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || ctx.req.headers.get("x-real-ip") || "").slice(0, 80) || null;
      const userAgent = (ctx.req.headers.get("user-agent") || "").slice(0, 300) || null;
      const docSha256 = original ? sha256(original) : null;
      const lang = ctx.lang === "en" ? "en" : "es";
      // The signed 8879 is built first; only then is the approval claimed, once (a double tap signs once).
      // The app's seal key (made the first time); without it the copy still goes, unsealed.
      const seal = await sealKey(db).catch((e: unknown) => { console.error("[tax.sign] seal key:", e instanceof Error ? e.message : e); return null; });
      // On the document: the name as on the return (the typed one matches it, maybe without accents or capitals).
      const pdfBytes = await signedPdf(original && f8879 ? { bytes: original, mimeType: f8879.mimeType } : null, png, {
        name: legalName || input.name, email: (ctx.user as { email?: string | null }).email ?? null, signedAt, ip, userAgent, docSha256,
        docName: f8879?.fileName ?? null, taxYear: year, lang, signId: signatureId(docSha256, signedAt, png),
        identity: { idType: check.idType, taxIdKind: check.taxIdKind, taxIdLast4: check.taxIdLast4, checkedBy: check.checkedByName, checkedAt: new Date(check.checkedAt) },
      }, input.spot ?? null, seal);
      const signed = Buffer.from(pdfBytes);
      const claim = await db.execute(sql`UPDATE taxReturns SET approvedAt = NOW() WHERE id = ${ret.id} AND step = ${SIGN_STEP} AND approvedAt IS NULL`);
      if (Number((claim as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0) === 0) return { ok: true, already: true };
      // Signed: the in-person window closes.
      await db.execute(sql`UPDATE taxIdChecks SET openUntil = NULL WHERE returnId = ${ret.id}`);
      await db.execute(sql`UPDATE taxReturns SET lang = ${lang} WHERE id = ${ret.id}`);
      await db.execute(sql`INSERT INTO taxSignatures (returnId, userId, name, signature, signedAt, ip, userAgent, docId, docSha256)
        VALUES (${ret.id}, ${userId}, ${input.name}, ${encryptTaxFile(png)}, ${signedAt}, ${ip}, ${userAgent}, ${f8879?.id ?? null}, ${docSha256})`);
      await db.insert(taxDocuments).values({
        returnId: ret.id, userId, kind: "f8879_signed", source: "preparer",
        fileName: lang === "en" ? `Signed 8879 ${year}.pdf` : `8879 firmado ${year}.pdf`,
        mimeType: "application/pdf", size: signed.length, data: encryptTaxFile(signed), status: "ok",
      });
      const body = lang === "en"
        ? "I signed the e-file authorization (Form 8879). I reviewed my return and the information is correct. You can file it."
        : "Firmé la autorización de e-file (Formulario 8879). Revisé mi declaración y los datos son correctos. Ya la puedes presentar.";
      await db.insert(taxMessages).values({ returnId: ret.id, fromRole: "client", authorName: ctx.user.name ?? null, body });
      await touch(db, ret.id);
      return { ok: true, already: false };
    }),

  sendMessage: unlockedQuery.input(z.object({ body: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await requireAccess(db, ctx.user, ctx.lang);
    await ensureTaxTables(db);
    const ret = await getOrCreateReturn(db, Number(ctx.user.id), modeOf(ctx.user), currentTaxYear());
    await db.insert(taxMessages).values({ returnId: ret.id, fromRole: "client", authorName: ctx.user.name ?? null, body: input.body });
    await touch(db, ret.id);
    return { ok: true };
  }),

  /** The client read the preparer's messages. */
  markRead: unlockedQuery.mutation(async ({ ctx }) => {
    const db = getDb();
    await ensureTaxTables(db);
    const ret = await findReturn(db, Number(ctx.user.id), modeOf(ctx.user), currentTaxYear());
    if (ret) {
      await db.update(taxMessages).set({ readAt: new Date() })
        .where(and(eq(taxMessages.returnId, ret.id), eq(taxMessages.fromRole, "preparer"), isNull(taxMessages.readAt)));
    }
    return { ok: true };
  }),

  // ── Preparers (admins) ──
  adminList: adminQuery.query(async () => {
    const db = getDb();
    await ensureTaxTables(db);
    const rets: (TaxReturnMeta & { name: string | null; email: string | null })[] = await db.select({ ...retMeta, name: users.name, email: users.email }).from(taxReturns)
      .leftJoin(users, eq(users.id, taxReturns.userId)).orderBy(desc(taxReturns.updatedAt));
    const ids = rets.map((r: { id: number }) => r.id);
    const pending = ids.length ? await db.select({ returnId: taxDocuments.returnId, n: sql<number>`count(*)` }).from(taxDocuments)
      .where(and(inArray(taxDocuments.returnId, ids), eq(taxDocuments.source, "client"), eq(taxDocuments.status, "pending"))).groupBy(taxDocuments.returnId) : [];
    const unread = ids.length ? await db.select({ returnId: taxMessages.returnId, n: sql<number>`count(*)` }).from(taxMessages)
      .where(and(inArray(taxMessages.returnId, ids), eq(taxMessages.fromRole, "client"), isNull(taxMessages.readAt))).groupBy(taxMessages.returnId) : [];
    type Count = { returnId: number; n: number };
    const pend = new Map<number, number>(pending.map((r: Count) => [r.returnId, Number(r.n)]));
    const unr = new Map<number, number>(unread.map((r: Count) => [r.returnId, Number(r.n)]));
    return rets.map((r): TaxReturnRow => ({ ...r, pendingDocs: pend.get(r.id) ?? 0, unreadMessages: unr.get(r.id) ?? 0 }));
  }),

  adminGet: adminQuery.input(z.object({ returnId: z.number().int().positive() })).query(async ({ input }) => {
    const db = getDb();
    await ensureTaxTables(db);
    const ret: (TaxReturnMeta & { name: string | null; email: string | null }) | undefined = (await db.select({ ...retMeta, name: users.name, email: users.email }).from(taxReturns)
      .leftJoin(users, eq(users.id, taxReturns.userId)).where(eq(taxReturns.id, input.returnId)).limit(1))[0];
    if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
    const docs: TaxDocMeta[] = await db.select(docMeta).from(taxDocuments).where(eq(taxDocuments.returnId, ret.id)).orderBy(taxDocuments.createdAt);
    const messages: TaxMessage[] = await db.select().from(taxMessages).where(eq(taxMessages.returnId, ret.id)).orderBy(taxMessages.createdAt);
    const counts: Record<string, number> = {};
    for (const d of docs) if (d.source === "client") counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    return { ret, docs, messages, missing: missingToSend(ret.mode, ret.answers ?? {}, counts), idCheck: await latestIdCheck(db, ret.id) };
  }),

  /**
   * "Revisé su identificación en persona" (IRS Pub. 1345, in-person e-signature): the preparer inspected a
   * government photo ID, compared the photo, and records name, SSN or ITIN, address and date of birth (kept
   * encrypted). The name must be the return's. Opens signing in the app for 30 minutes (they're together).
   */
  adminIdCheck: adminQuery
    .input(z.object({
      returnId: z.number().int().positive(), idType: z.enum(ID_TYPES), name: z.string().trim().min(3).max(160),
      taxIdKind: z.enum(["ssn", "itin"]), taxId: z.string().trim().max(20), address: z.string().trim().min(5).max(240),
      dob: z.string().trim().max(10), photoMatched: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureTaxTables(db);
      if (!hasTaxKey()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: msg(ctx.lang, "taxNoKey") });
      const ret = (await db.select(retMeta).from(taxReturns).where(eq(taxReturns.id, input.returnId)).limit(1))[0] as TaxReturnMeta | undefined;
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      const digits = input.taxId.replace(/\D/g, "");
      const itinOk = input.taxIdKind === "itin" ? digits.startsWith("9") : !digits.startsWith("9");
      if (digits.length !== 9 || !itinOk || !realBirthDate(input.dob)) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxIdCheckBad") });
      const legal = ret.legalName?.trim();
      if (legal && !sameName(input.name, legal)) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxIdCheckName") });
      if (!legal) await db.execute(sql`UPDATE taxReturns SET legalName = ${input.name} WHERE id = ${ret.id}`);
      const data = encryptTaxFile(Buffer.from(JSON.stringify({ name: input.name, taxIdKind: input.taxIdKind, taxId: digits, address: input.address, dob: input.dob })));
      const canSign = ret.step === SIGN_STEP && !ret.approvedAt;
      await db.execute(sql`INSERT INTO taxIdChecks (returnId, userId, checkedBy, checkedByName, idType, taxIdKind, taxIdLast4, data, openUntil)
        VALUES (${ret.id}, ${ret.userId}, ${Number(ctx.user.id)}, ${ctx.user.name ?? null}, ${input.idType}, ${input.taxIdKind}, ${digits.slice(-4)}, ${data},
        ${canSign ? sql`NOW() + INTERVAL 30 MINUTE` : null})`);
      return { ok: true, open: canSign };
    }),

  /** Opens (30 minutes, with the client in front of them) or closes signing in the app, after an ID check. */
  adminOpenSigning: adminQuery
    .input(z.object({ returnId: z.number().int().positive(), open: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureTaxTables(db);
      const check = await latestIdCheck(db, input.returnId);
      if (!check) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxIdCheckNone") });
      await db.execute(sql`UPDATE taxIdChecks SET openUntil = ${input.open ? sql`NOW() + INTERVAL 30 MINUTE` : null}
        WHERE returnId = ${input.returnId} ORDER BY id DESC LIMIT 1`);
      return { ok: true };
    }),

  /** The preparer read the client's messages. */
  adminMarkRead: adminQuery.input(z.object({ returnId: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = getDb();
    await ensureTaxTables(db);
    await db.update(taxMessages).set({ readAt: new Date() })
      .where(and(eq(taxMessages.returnId, input.returnId), eq(taxMessages.fromRole, "client"), isNull(taxMessages.readAt)));
    return { ok: true };
  }),

  adminSetDoc: adminQuery
    .input(z.object({ docId: z.number().int().positive(), status: z.enum(["pending", "ok", "redo"]), note: z.string().trim().max(500).nullable().optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureTaxTables(db);
      await db.update(taxDocuments).set({ status: input.status, note: input.status === "redo" ? input.note || null : null }).where(eq(taxDocuments.id, input.docId));
      // The hand-signed 8879 marked "Está bien" is the client's signature: the return is approved. Taken back, it isn't
      // (unless they also signed in the app).
      const doc = (await db.select({ kind: taxDocuments.kind, returnId: taxDocuments.returnId }).from(taxDocuments).where(eq(taxDocuments.id, input.docId)).limit(1))[0];
      if (doc?.kind === PAPER_8879) {
        if (input.status === "ok") {
          await db.execute(sql`UPDATE taxReturns SET approvedAt = NOW() WHERE id = ${doc.returnId} AND step = ${SIGN_STEP} AND approvedAt IS NULL`);
        } else {
          await db.execute(sql`UPDATE taxReturns SET approvedAt = NULL WHERE id = ${doc.returnId} AND step = ${SIGN_STEP}
            AND NOT EXISTS (SELECT 1 FROM taxDocuments WHERE returnId = ${doc.returnId} AND kind = 'f8879_signed')`);
        }
      }
      return { ok: true };
    }),

  adminSetStep: adminQuery
    .input(z.object({ returnId: z.number().int().positive(), step: z.number().int().min(DRAFT_STEP).max(TAX_STEP_COUNT - 1) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureTaxTables(db);
      const ret = (await db.select({ step: taxReturns.step, stepDates: taxReturns.stepDates }).from(taxReturns).where(eq(taxReturns.id, input.returnId)).limit(1))[0];
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(taxReturns).set({ step: input.step, stepDates: stepDatesWith(ret.stepDates, input.step) }).where(eq(taxReturns.id, input.returnId));
      // Back before "Revisa y firma": the client approves again when it comes back.
      if (input.step < SIGN_STEP) await db.execute(sql`UPDATE taxReturns SET approvedAt = NULL WHERE id = ${input.returnId}`);
      // Forward: the client gets the email of the step it reached (going back sends nothing).
      if (input.step > ret.step && input.step >= 0) void notifyStep(db, input.returnId, input.step);
      return { ok: true };
    }),

  adminSetResults: adminQuery
    .input(z.object({
      returnId: z.number().int().positive(), filingStatus: z.string().trim().max(40).nullable().optional(), fed: resultInput, state: resultInput,
      legalName: z.string().trim().max(160).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureTaxTables(db);
      if (input.legalName !== undefined) await db.execute(sql`UPDATE taxReturns SET legalName = ${input.legalName || null} WHERE id = ${input.returnId}`);
      const set: Partial<typeof taxReturns.$inferInsert> = {};
      if (input.filingStatus !== undefined) set.filingStatus = input.filingStatus || null;
      if (input.fed !== undefined) set.fedResult = input.fed;
      if (input.state !== undefined) set.stateResult = input.state;
      if (Object.keys(set).length) await db.update(taxReturns).set(set).where(eq(taxReturns.id, input.returnId));
      return { ok: true };
    }),

  /** The preparer uploads the finished returns or the e-file authorization. */
  adminUpload: adminQuery
    .input(z.object({ returnId: z.number().int().positive(), kind: z.enum(PREPARER_DOC_KINDS), ...fileInput }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { buf, fileName } = decodeFile(input, ctx.lang);
      await ensureTaxTables(db);
      const ret = (await db.select({ userId: taxReturns.userId }).from(taxReturns).where(eq(taxReturns.id, input.returnId)).limit(1))[0];
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      await db.insert(taxDocuments).values({
        returnId: input.returnId, userId: ret.userId, kind: input.kind, source: "preparer", fileName, mimeType: input.mimeType, size: buf.length,
        data: encryptTaxFile(buf), status: "ok",
      });
      // With the 1040 and the 8879 up, the return goes to "Revisa y firma" by itself (and the client is told).
      const now = (await db.select({ step: taxReturns.step, stepDates: taxReturns.stepDates }).from(taxReturns).where(eq(taxReturns.id, input.returnId)).limit(1))[0];
      if (now && now.step >= 0 && now.step < SIGN_STEP && (input.kind === "f8879" || input.kind === "final_fed")) {
        const have = await db.select({ kind: taxDocuments.kind }).from(taxDocuments)
          .where(and(eq(taxDocuments.returnId, input.returnId), eq(taxDocuments.source, "preparer"), inArray(taxDocuments.kind, ["f8879", "final_fed"])));
        if (have.some((d: { kind: string }) => d.kind === "f8879") && have.some((d: { kind: string }) => d.kind === "final_fed")) {
          await db.update(taxReturns).set({ step: SIGN_STEP, stepDates: stepDatesWith(now.stepDates, SIGN_STEP) }).where(eq(taxReturns.id, input.returnId));
          void notifyStep(db, input.returnId, SIGN_STEP);
          return { ok: true, movedToSign: true };
        }
      }
      return { ok: true, movedToSign: false };
    }),

  adminDeleteDoc: adminQuery.input(z.object({ docId: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = getDb();
    await ensureTaxTables(db);
    // The signed 8879 is the record of the client's signature: it stays.
    await db.delete(taxDocuments).where(and(eq(taxDocuments.id, input.docId), eq(taxDocuments.source, "preparer"), ne(taxDocuments.kind, "f8879_signed")));
    return { ok: true };
  }),

  adminSendMessage: adminQuery
    .input(z.object({ returnId: z.number().int().positive(), body: z.string().trim().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await ensureTaxTables(db);
      await db.insert(taxMessages).values({ returnId: input.returnId, fromRole: "preparer", authorName: ctx.user.name ?? null, body: input.body });
      return { ok: true };
    }),
});
