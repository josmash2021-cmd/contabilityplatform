// What the Impuestos screens derive from tax.current: documents per kind, their status, the to-do list,
// dates and money. Rules (which documents, when they're required) come from contracts/taxRules.ts.
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { ARRIVES_BY_JAN31, TAX_MAX_FILES_PER_KIND, shownDocKinds, type Answers, type TaxDocKind, type TaxMode } from "@contracts/taxRules";

export type Current = inferRouterOutputs<AppRouter>["tax"]["current"];
export type Doc = Current["docs"][number];
export type Msg = Current["messages"][number];
export type Ret = NonNullable<Current["ret"]>;
export type TaxResult = { kind: "refund" | "owe"; amount: number } | null | undefined;

/** Steps from which the return is with the IRS: documents can't change anymore (same as the server). */
export const FILED_STEP = 4;
export const MAX_FILES = TAX_MAX_FILES_PER_KIND;

/** Kinds that usually take one file: "Cambiar" replaces it. The rest take several ("Agregar otro"). */
const SINGLE = new Set(["ssn", "home", "mkt", "ein", "prior"]);
export const isMulti = (kind: string) => !SINGLE.has(kind);

export const GROUP_ORDER = ["ident", "inc", "biz", "ded"] as const;
export function groupOf(mode: TaxMode, kind: string, docGroup: Record<string, string>): string {
  return mode === "business" && kind === "other" ? "biz" : docGroup[kind] ?? "ded";
}

export function clientFiles(docs: readonly Doc[], kind: string): Doc[] {
  return docs.filter((d) => d.source === "client" && d.kind === kind);
}

export type DocState = "missing" | "jan31" | "whenYes" | "optional" | "redo" | "ok" | "got";
/** The prototype's taxStatus: what a document row says. */
export function docState(kind: TaxDocKind, files: readonly Doc[]): DocState {
  if (files.length === 0) {
    if (kind.need === "yes") return "missing";
    if (ARRIVES_BY_JAN31.has(kind.id)) return "jan31";
    if (kind.when) return "whenYes";
    return "optional";
  }
  if (files.some((f) => f.status === "redo")) return "redo";
  if (files.every((f) => f.status === "ok")) return "ok";
  return "got";
}

export type TodoItem = { kind: TaxDocKind | null; tone: "warn" | "info"; text: "need" | "redo" | "w2" | "jan31" | "becauseYes" | "questions"; n?: number };
/** "Te faltan N cosas" (taxTodoItems): required and redo documents first, then the ones on their way and the questions. */
export function todoItems(mode: TaxMode, answers: Answers, docs: readonly Doc[], unanswered: number): TodoItem[] {
  const out: TodoItem[] = [];
  for (const k of shownDocKinds(mode, answers)) {
    const files = clientFiles(docs, k.id);
    if (files.length) {
      if (files.some((f) => f.status === "redo")) out.push({ kind: k, tone: "warn", text: "redo" });
      continue;
    }
    if (k.need === "yes") out.push({ kind: k, tone: "warn", text: "need" });
    else if (k.id === "w2") out.push({ kind: k, tone: "info", text: "w2" });
    else if (ARRIVES_BY_JAN31.has(k.id)) out.push({ kind: k, tone: "info", text: "jan31" });
    else if (k.when) out.push({ kind: k, tone: "info", text: "becauseYes" });
  }
  if (unanswered) out.push({ kind: null, tone: "info", text: "questions", n: unanswered });
  return out.sort((a, b) => (a.tone === "warn" ? 0 : 1) - (b.tone === "warn" ? 0 : 1));
}

export type MustItem = { kind: TaxDocKind | null; text: "need" | "redo" | "income" | "questions"; n?: number };
/**
 * "Lo que te falta", split in two so it never contradicts "Lista para enviar": `must` is what blocks sending
 * (a required document, one that has to be uploaded again, one income document, unanswered questions);
 * `maybe` is what helps but isn't required (shown apart as "Si los tienes").
 */
export function todoSplit(mode: TaxMode, answers: Answers, docs: readonly Doc[], unanswered: number, incomeMissing: boolean): { must: MustItem[]; maybe: TaxDocKind[] } {
  const must: MustItem[] = [];
  const maybe: TaxDocKind[] = [];
  const kinds = shownDocKinds(mode, answers);
  for (const k of kinds) {
    const files = clientFiles(docs, k.id);
    if (files.some((f) => f.status === "redo")) { must.push({ kind: k, text: "redo" }); continue; }
    if (files.length) continue;
    if (k.need === "yes") must.push({ kind: k, text: "need" });
    else if (k.need !== "income") maybe.push(k);
  }
  if (incomeMissing) {
    const first = kinds.find((k) => k.need === "income") ?? null;
    must.push({ kind: first, text: "income" });
  } else {
    // Income documents beyond the first one are welcome, not required.
    for (const k of kinds) if (k.need === "income" && clientFiles(docs, k.id).length === 0) maybe.push(k);
  }
  if (unanswered) must.push({ kind: null, text: "questions", n: unanswered });
  return { must: must.sort((a, b) => (a.text === "redo" ? 0 : 1) - (b.text === "redo" ? 0 : 1)), maybe };
}

/** "19 nov" this year, "3 feb 2027" another year. */
export function shortDate(iso: string | Date | null | undefined, locale: string, thisYear: number): string {
  if (!iso) return "";
  // MySQL can send "2026-11-21 14:15:55": Safari only reads it with a "T".
  const d = iso instanceof Date ? iso : new Date(/^\d{4}-\d{2}-\d{2} \d/.test(iso) ? iso.replace(" ", "T") : iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", ...(d.getFullYear() !== thisYear ? { year: "numeric" } : {}) }).replace(".", "");
}

/** "$1,240" or "$1,240.50". */
export function taxMoney(n: number): string {
  const cents = Math.round(n * 100) % 100 !== 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** "1.2 MB" / "240 KB". */
export function fileSize(n: number): string {
  return n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Days from today to a calendar day "YYYY-MM-DD" (today read on this device). */
export function daysUntil(day: string, now: Date): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
}

/** "15 abr 2027" for a calendar day. */
export function longDay(day: string, locale: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
}

/** A result as "reembolso de $X" / "a pagar $X". */
export function resultText(r: TaxResult, words: { refundOf: (a: string) => string; oweOf: (a: string) => string }): string | null {
  if (!r) return null;
  return r.kind === "refund" ? words.refundOf(taxMoney(r.amount)) : words.oweOf(taxMoney(r.amount));
}
