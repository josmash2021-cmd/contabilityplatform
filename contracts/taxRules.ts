// ── Impuestos: rules shared by the server (validation) and the client (checklist) ──
// Federal + Alabama returns. Texts live in the client copy; here only ids and rules.

export type TaxMode = "business" | "personal";
export type Need = "yes" | "income" | "opt";

/** Questions about the person's situation. They decide which documents we ask for. */
export const TAX_QUESTIONS: Record<TaxMode, readonly string[]> = {
  personal: ["married", "deps", "self", "home", "mkt"],
  business: ["married", "deps", "k1099", "employees", "vehicle"],
};

export type TaxDocKind = {
  id: string;
  /** Shown only when this question was answered yes. */
  when?: string;
  /** yes = required to send · income = one income document is required · opt = optional */
  need: Need;
};

export const TAX_DOC_KINDS: Record<TaxMode, readonly TaxDocKind[]> = {
  personal: [
    { id: "id", need: "yes" },
    { id: "ssn", need: "yes" },
    { id: "spouse", when: "married", need: "yes" },
    { id: "deps", when: "deps", need: "yes" },
    { id: "w2", need: "income" },
    { id: "k1099", when: "self", need: "income" },
    { id: "pay", need: "income" },
    { id: "int", need: "opt" },
    { id: "home", when: "home", need: "opt" },
    { id: "mkt", when: "mkt", need: "yes" },
    { id: "other", need: "opt" },
  ],
  business: [
    { id: "id", need: "yes" },
    { id: "ssn", need: "yes" },
    { id: "spouse", when: "married", need: "yes" },
    { id: "deps", when: "deps", need: "yes" },
    { id: "ein", need: "opt" },
    { id: "k1099", when: "k1099", need: "yes" },
    { id: "payroll", when: "employees", need: "yes" },
    { id: "vehicle", when: "vehicle", need: "opt" },
    { id: "assets", need: "opt" },
    { id: "prior", need: "opt" },
    { id: "other", need: "opt" },
  ],
};

/** Documents the preparer gives back: the finished returns and the e-file authorization. */
export const PREPARER_DOC_KINDS = ["final_fed", "final_state", "f8879", "prep_other"] as const;
export type PreparerDocKind = (typeof PREPARER_DOC_KINDS)[number];

/** The return's progress. -1 = not sent yet (the person is still gathering documents). */
export const TAX_STEP_COUNT = 8; // received, reviewing, preparing, sign, filed, accepted, refund sent, refund deposited
export const DRAFT_STEP = -1;

export const TAX_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;
export const TAX_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const TAX_MAX_FILES_PER_KIND = 10;

export type Answers = Record<string, boolean | null | undefined>;

/**
 * The tax year people are working on. From October on we're getting ready for the
 * next filing season (this year's taxes, filed by April 15); before that, it's last year's.
 */
export function currentTaxYear(now: Date = new Date()): number {
  return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}

export function isClientDocKind(mode: TaxMode, kind: string): boolean {
  return TAX_DOC_KINDS[mode].some((k) => k.id === kind);
}

/** The documents to show for these answers. */
export function shownDocKinds(mode: TaxMode, answers: Answers): TaxDocKind[] {
  return TAX_DOC_KINDS[mode].filter((k) => !k.when || answers[k.when] === true);
}

export type Missing = { questions: string[]; docs: string[]; income: boolean };

/**
 * What's still needed before the person can send everything to the preparer:
 * every question answered, every required document, and (personal) one income document.
 */
export function missingToSend(mode: TaxMode, answers: Answers, filesByKind: Record<string, number>): Missing {
  const questions = TAX_QUESTIONS[mode].filter((q) => answers[q] !== true && answers[q] !== false);
  const shown = shownDocKinds(mode, answers);
  const docs = shown.filter((k) => k.need === "yes" && !(filesByKind[k.id] > 0)).map((k) => k.id);
  const incomeKinds = shown.filter((k) => k.need === "income");
  const income = incomeKinds.length > 0 && !incomeKinds.some((k) => filesByKind[k.id] > 0);
  return { questions, docs, income };
}

export function canSend(m: Missing): boolean {
  return m.questions.length === 0 && m.docs.length === 0 && !m.income;
}

/** The return's steps: 0 received … 3 the client reviews and signs … 4 filed … 7 refund deposited. */
export const TAX_STEP = { received: 0, reviewing: 1, preparing: 2, sign: 3, filed: 4, accepted: 5, refundSent: 6, deposited: 7 } as const;

/** April 15 of the year after the tax year (moved to the next weekday when it falls on a weekend). */
export function filingDeadline(taxYear: number): string {
  const d = new Date(Date.UTC(taxYear + 1, 3, 15));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(17);
  else if (dow === 0) d.setUTCDate(16);
  return d.toISOString().slice(0, 10);
}

/** Documents that arrive by January 31 (W-2, 1099s, 1098): shown as "Llega a más tardar el 31 de enero". */
export const ARRIVES_BY_JAN31: ReadonlySet<string> = new Set(["w2", "int", "home", "k1099", "payroll"]);

// ── What the tax endpoints return (shared with the client) ──
export type TaxResult = { kind: "refund" | "owe"; amount: number } | null;

export type TaxReturnMeta = {
  id: number;
  userId: number;
  taxYear: number;
  mode: TaxMode;
  state: string;
  step: number;
  stepDates: (string | null)[] | null;
  answers: Record<string, boolean | null> | null;
  filingStatus: string | null;
  fedResult: TaxResult;
  stateResult: TaxResult;
  submittedAt: Date | null;
  updatedAt: Date;
  /** When the client approved the finished return ("Revisa y firma"); null until then. */
  approvedAt: Date | string | null;
};

export type TaxDocMeta = {
  id: number;
  kind: string;
  source: "client" | "preparer";
  fileName: string;
  mimeType: string;
  size: number;
  status: "pending" | "ok" | "redo";
  note: string | null;
  createdAt: Date;
};

export type TaxMessage = {
  id: number;
  returnId: number;
  fromRole: "client" | "preparer";
  authorName: string | null;
  body: string;
  readAt: Date | null;
  createdAt: Date;
};

/** A return in the preparer's list, with who it belongs to and what needs attention. */
export type TaxReturnRow = TaxReturnMeta & { name: string | null; email: string | null; pendingDocs: number; unreadMessages: number };
