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
