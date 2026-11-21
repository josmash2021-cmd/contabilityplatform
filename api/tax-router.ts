// ── Impuestos ──
// The client uploads documents from the phone, answers a few questions and sends
// everything to our preparers (admins). Preparers review each document, move the
// return through its steps, upload the finished returns and talk with the client.
// Federal + Alabama. Preparation is free for the client. Files are encrypted (taxCrypto).
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { subscriptions, taxDocuments, taxMessages, taxReturns, users } from "@db/schema";
import { accountMode } from "./lib/plans";
import { lastPaidTier } from "./lib/planAccess";
import { getTrialInfo } from "./lib/trial";
import { msg, type Lang } from "./lib/i18n";
import { decryptTaxFile, encryptTaxFile, hasTaxKey } from "./lib/taxCrypto";
import {
  DRAFT_STEP, PREPARER_DOC_KINDS, TAX_FILE_TYPES, TAX_MAX_FILE_BYTES, TAX_MAX_FILES_PER_KIND, TAX_QUESTIONS, TAX_STEP_COUNT,
  canSend, currentTaxYear, isClientDocKind, missingToSend,
  type TaxDocMeta, type TaxMessage, type TaxMode, type TaxReturnMeta, type TaxReturnRow,
} from "@contracts/taxRules";

type Db = ReturnType<typeof getDb>;
type CtxUser = { id: number | string; role?: string | null; modePreference?: string | null; createdAt?: Date | string | null; name?: string | null };

/** Steps from which the return is with the IRS: documents can't change anymore. */
const FILED_STEP = 4;

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
    if (!/doesn't exist|ER_NO_SUCH_TABLE/i.test(e instanceof Error ? e.message : String(e))) throw e;
  }
}

// ── Who can use Impuestos ──
/** Personal: everyone (Básico is free). Business: Pro and Negocio, and the free trial. */
export async function taxAccess(db: Db, user: CtxUser): Promise<{ allowed: boolean }> {
  if (user.role === "admin") return { allowed: true };
  const mode = accountMode(user.modePreference);
  if (mode === "personal") return { allowed: true };
  if (getTrialInfo(user.createdAt)?.active) return { allowed: true };
  const userId = Number(user.id);
  if ((await lastPaidTier(db, userId, mode)) === "basic") return { allowed: false };
  const sub = (await db.select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd }).from(subscriptions)
    .where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(1))[0];
  const active = !!sub && (sub.status === "active" || sub.status === "trialing") && (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd) > new Date());
  return { allowed: active };
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

export const taxRouter = createRouter({
  // ── Client ──
  /** Everything the Impuestos page shows for this year, plus the years before. */
  current: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const access = await taxAccess(db, ctx.user);
    const mode = modeOf(ctx.user);
    const year = currentTaxYear();
    const base = { access, mode, year, keyReady: hasTaxKey() };
    if (!access.allowed) return { ...base, ret: null as TaxReturnMeta | null, docs: [] as TaxDocMeta[], messages: [] as TaxMessage[], past: [] as TaxReturnMeta[], missing: null };
    await ensureTaxTables(db);
    const userId = Number(ctx.user.id);
    const ret = await findReturn(db, userId, mode, year);
    const docs: TaxDocMeta[] = ret ? await db.select(docMeta).from(taxDocuments).where(eq(taxDocuments.returnId, ret.id)).orderBy(taxDocuments.createdAt) : [];
    const messages: TaxMessage[] = ret ? await db.select().from(taxMessages).where(eq(taxMessages.returnId, ret.id)).orderBy(taxMessages.createdAt) : [];
    const past: TaxReturnMeta[] = await db.select(retMeta).from(taxReturns)
      .where(and(eq(taxReturns.userId, userId), eq(taxReturns.mode, mode), lt(taxReturns.taxYear, year))).orderBy(desc(taxReturns.taxYear));
    const counts: Record<string, number> = {};
    for (const d of docs) if (d.source === "client") counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    return { ...base, ret, docs, messages, past, missing: missingToSend(mode, ret?.answers ?? {}, counts) };
  }),

  /** A past year's return: its summary and documents. */
  pastYear: authedQuery.input(z.object({ returnId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = getDb();
    await ensureTaxTables(db);
    const ret: TaxReturnMeta | undefined = (await db.select(retMeta).from(taxReturns).where(and(eq(taxReturns.id, input.returnId), eq(taxReturns.userId, Number(ctx.user.id)))).limit(1))[0];
    if (!ret) throw new TRPCError({ code: "NOT_FOUND", message: msg(ctx.lang, "taxNotFound") });
    const docs: TaxDocMeta[] = await db.select(docMeta).from(taxDocuments).where(eq(taxDocuments.returnId, ret.id)).orderBy(taxDocuments.createdAt);
    return { ret, docs };
  }),

  saveAnswers: authedQuery
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

  upload: authedQuery
    .input(z.object({ kind: z.string().max(30), ...fileInput }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await requireAccess(db, ctx.user, ctx.lang);
      const mode = modeOf(ctx.user);
      if (!isClientDocKind(mode, input.kind)) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxBadFile") });
      const { buf, fileName } = decodeFile(input, ctx.lang);
      await ensureTaxTables(db);
      const userId = Number(ctx.user.id);
      const ret = await getOrCreateReturn(db, userId, mode, currentTaxYear());
      if (ret.step >= FILED_STEP) throw new TRPCError({ code: "BAD_REQUEST", message: msg(ctx.lang, "taxLocked") });
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
  deleteDoc: authedQuery.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
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
  file: authedQuery.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const db = getDb();
    await ensureTaxTables(db);
    const isAdmin = ctx.user.role === "admin";
    const where = isAdmin ? eq(taxDocuments.id, input.id) : and(eq(taxDocuments.id, input.id), eq(taxDocuments.userId, Number(ctx.user.id)));
    const doc = (await db.select().from(taxDocuments).where(where).limit(1))[0];
    if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: msg(ctx.lang, "taxNotFound") });
    return { fileName: doc.fileName, mimeType: doc.mimeType, dataBase64: decryptTaxFile(Buffer.from(doc.data)).toString("base64") };
  }),

  /** Sends the documents to the preparer. */
  submit: authedQuery
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
      return { ok: true };
    }),

  sendMessage: authedQuery.input(z.object({ body: z.string().trim().min(1).max(2000) })).mutation(async ({ ctx, input }) => {
    const db = getDb();
    await requireAccess(db, ctx.user, ctx.lang);
    await ensureTaxTables(db);
    const ret = await getOrCreateReturn(db, Number(ctx.user.id), modeOf(ctx.user), currentTaxYear());
    await db.insert(taxMessages).values({ returnId: ret.id, fromRole: "client", authorName: ctx.user.name ?? null, body: input.body });
    await touch(db, ret.id);
    return { ok: true };
  }),

  /** The client read the preparer's messages. */
  markRead: authedQuery.mutation(async ({ ctx }) => {
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
    return { ret, docs, messages, missing: missingToSend(ret.mode, ret.answers ?? {}, counts) };
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
      return { ok: true };
    }),

  adminSetStep: adminQuery
    .input(z.object({ returnId: z.number().int().positive(), step: z.number().int().min(DRAFT_STEP).max(TAX_STEP_COUNT - 1) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureTaxTables(db);
      const ret = (await db.select({ stepDates: taxReturns.stepDates }).from(taxReturns).where(eq(taxReturns.id, input.returnId)).limit(1))[0];
      if (!ret) throw new TRPCError({ code: "NOT_FOUND" });
      await db.update(taxReturns).set({ step: input.step, stepDates: stepDatesWith(ret.stepDates, input.step) }).where(eq(taxReturns.id, input.returnId));
      return { ok: true };
    }),

  adminSetResults: adminQuery
    .input(z.object({ returnId: z.number().int().positive(), filingStatus: z.string().trim().max(40).nullable().optional(), fed: resultInput, state: resultInput }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await ensureTaxTables(db);
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
      return { ok: true };
    }),

  adminDeleteDoc: adminQuery.input(z.object({ docId: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = getDb();
    await ensureTaxTables(db);
    await db.delete(taxDocuments).where(and(eq(taxDocuments.id, input.docId), eq(taxDocuments.source, "preparer")));
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
