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
  /** The client's full name as on their ID, set by the preparer; the client types it the same to sign. */
  legalName: string | null;
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

// ── Signing the 8879 (the page shows it live, the server stamps the same) ──

/** A name to compare: no accents, no case, dots/hyphens/commas as spaces, single spaces. */
export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** The typed name is the full name on the return: every name and last name, in order ("María López" ≠ "María José López"). */
export function sameName(typed: string, legal: string): boolean {
  const a = normalizeName(typed);
  return a.length > 0 && a === normalizeName(legal);
}

/**
 * Where the taxpayer signs on Form 8879, in PDF points (origin bottom-left): the "Your signature" line from `x`
 * (`w` wide) on the baseline `y`, the label at `labelX`, and the "Date" box from `dateX`. Found in the PDF's
 * text by the page; the server checks it fits the page.
 */
export type SignSpot = { page: number; labelX: number; x: number; y: number; w: number; dateX: number | null };

/** The IRS layout of Form 8879 (Part II, "Your signature ▶ … Date ▶"): used when the PDF has no text to search. */
export const IRS_8879_SPOT: SignSpot = { page: 1, labelX: 36, x: 106, y: 302.6, w: 278, dateX: 424 };

/** A piece of text as pdf.js gives it: the string, its transform ([a, b, c, d, x, y]) and its width in points. */
export type PdfTextItem = { str: string; transform: number[]; width: number };
const SIGN_LABEL = /^\s*(your signature|taxpayer['’]?s signature)/i;

/**
 * The taxpayer's signature line in the 8879's text: "Your signature ▶" and, on the same line, "Date ▶". Pages
 * are searched in order; without it (a scanned PDF), the IRS layout, scaled to the first page.
 */
export function findSignSpot(pages: ReadonlyArray<{ items: readonly PdfTextItem[]; width: number; height: number }>): SignSpot {
  for (let p = 0; p < pages.length; p++) {
    const { items, width } = pages[p];
    const label = items.find((it) => SIGN_LABEL.test(it.str));
    if (!label) continue;
    const [, , , , lx, ly] = label.transform;
    const sameLine = (it: PdfTextItem) => Math.abs(it.transform[5] - ly) < 4;
    const str = label.str.trimStart();
    const lead = label.str.length - str.length;
    const perChar = label.str.length ? label.width / label.str.length : 5;
    const labelLen = (SIGN_LABEL.exec(label.str)?.[0].length ?? label.str.length);
    // The label and the line may come as one piece ("Your signature ____ Date ____"): measure inside it.
    const inlineDate = str.search(/\bdate\b/i);
    const labelEnd = inlineDate > 0 || label.str.length > labelLen + 2 ? lx + perChar * labelLen : lx + label.width;
    const arrow = items.find((it) => sameLine(it) && it.str.trim() === "▶" && it.transform[4] >= labelEnd - 1 && it.transform[4] < labelEnd + 16);
    const x = arrow ? arrow.transform[4] + arrow.width + 2 : labelEnd + 6;
    let dateLabel: number | null = null;
    let dateX: number | null = null;
    if (inlineDate > 0) {
      dateLabel = lx + perChar * (lead + inlineDate);
      dateX = dateLabel + perChar * 4 + 6;
    } else {
      const d = items.find((it) => sameLine(it) && /^\s*date\b/i.test(it.str) && it.transform[4] > x + 60);
      if (d) {
        dateLabel = d.transform[4];
        const dArrow = items.find((it) => sameLine(it) && it.str.trim() === "▶" && it.transform[4] >= d.transform[4] + d.width - 1 && it.transform[4] < d.transform[4] + d.width + 16);
        dateX = dArrow ? dArrow.transform[4] + dArrow.width + 3 : d.transform[4] + d.width + 6;
      }
    }
    const w = Math.max(80, (dateLabel ?? Math.min(width - 36, x + 280)) - 8 - x);
    return { page: p + 1, labelX: lx, x, y: ly, w, dateX };
  }
  const first = pages[0];
  const kx = first ? first.width / 612 : 1, ky = first ? first.height / 792 : 1;
  const s = IRS_8879_SPOT;
  return { page: 1, labelX: s.labelX * kx, x: s.x * kx, y: s.y * ky, w: s.w * kx, dateX: s.dateX === null ? null : s.dateX * kx };
}

/** How the signature sits on the line (points): its box, and the small "signed" note beside it. */
export const STAMP = { sigLeft: 4, sigBelow: 3, sigH: 26, sigMaxW: 150, gap: 8, headSize: 5.5, nameSize: 7, timeSize: 6.5, idSize: 5.5, dateSize: 9 } as const;

/** The signing moment as the IRS form shows it: Alabama's date (MM/DD/YYYY) and time with its zone. */
export function signMoment(d: Date): { date: string; time: string } {
  const date = d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" });
  // Some browsers put a narrow space before "PM", which the PDF's font doesn't have: a plain space everywhere.
  const time = d.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).replace(/[\u202f\u00a0]/g, " ");
  return { date, time };
}

/** The words of the stamp beside the signature: in English, like the IRS form it goes on (the app and the signature page speak the client's language). */
export const STAMP_HEAD = "Electronically signed by";
/** The signature's ID under the stamp ("ID 7F3A-91C2"), the same one on the signature page. */
export const stampId = (id: string) => `ID ${id}`;
