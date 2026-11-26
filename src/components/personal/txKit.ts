// Shared pieces for the personal Inicio, Movimientos and Cuentas (2.0 prototype: pHome, pTx, pAccounts).
// Bank movements and the ones added by hand become one row shape; dates are calendar days read in UTC
// (personalUtils), and logos come from src/components/brand (Plaid's originals, never drawn here).
import { useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import type { PersonalBankCopy } from "@/i18n/copy/personalBank";
import { useCopy } from "@/i18n/useI18n";
import { personalCopy } from "@/i18n/copy/personal";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { budgetCategoryLabel } from "@/i18n/copy/budgets";
import { displayAccountName } from "../../../api/lib/banks";
import { REVIEW_WINDOW_DAYS } from "../../../api/lib/bankReview";
import { displayNameOf } from "../../../api/lib/reviewEngine";
import { dayKey, localTodayKey, num, txDay, type ManualTx } from "./personalUtils";

/** One line in a movements list: a bank movement or one the person added by hand. */
export type TxRow = {
  key: string;
  /** The saved bank movement's id (what review.* works on); null for live rows not saved yet and for manual ones. */
  id: number | null;
  /** What people recognize: the merchant's name when the bank gives one, else the bank's text. */
  name: string;
  /** The bank's own text ("STARBUCKS #11872 HOUSTON TX"). */
  raw: string;
  amount: number;
  isIn: boolean;
  type: string;
  category: string;
  date: unknown;
  day: string;
  accountId: number | null;
  bankName: string | null;
  accountNumber: string | null;
  logoUrl: string | null;
  reviewed: boolean;
  manual: ManualTx | null;
};

/** A row as bank.getMonthData sends it (live Plaid rows or saved ones), read defensively. */
type RawBankTx = {
  id?: number | string | null;
  plaidTransactionId?: string | null;
  description?: string | null;
  merchantName?: string | null;
  amount?: string | number | null;
  type?: string | null;
  category?: string | null;
  transactionDate?: unknown;
  bankAccountId?: number | string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  logoUrl?: string | null;
  isReconciled?: boolean | number | null;
};

export function bankRow(x: RawBankTx, i: number): TxRow {
  const raw = (x.description ?? "").trim();
  // Plaid's merchant name unless it contradicts the bank's text (a wrong guess: "ATS ALABASTER" sent as AT&T), else
  // a readable name from the bank's text, like the business screens show it (api/lib/reviewEngine.ts displayNameOf).
  const merchant = raw || x.merchantName ? displayNameOf(raw, x.merchantName) : "";
  const id = x.id === null || x.id === undefined || x.id === "" ? null : Number(x.id);
  return {
    key: `b-${x.plaidTransactionId ?? x.id ?? i}`,
    id: id !== null && Number.isFinite(id) && id > 0 ? id : null,
    name: merchant || raw,
    raw,
    amount: Math.abs(num(x.amount)),
    isIn: x.type === "income",
    type: x.type ?? "expense",
    category: x.category || "other",
    date: x.transactionDate,
    day: dayKey(x.transactionDate),
    accountId: x.bankAccountId === null || x.bankAccountId === undefined ? null : Number(x.bankAccountId),
    bankName: x.bankName ?? null,
    accountNumber: x.accountNumber ?? null,
    logoUrl: typeof x.logoUrl === "string" ? x.logoUrl : null,
    reviewed: !!Number(x.isReconciled ?? 0),
    manual: null,
  };
}

export function manualRow(x: ManualTx): TxRow {
  return {
    key: `m-${x.id}`, id: null, name: x.description, raw: x.description, amount: Math.abs(num(x.amount)), isIn: x.type === "income",
    type: x.type, category: x.category, date: x.transactionDate, day: dayKey(x.transactionDate), accountId: null,
    bankName: null, accountNumber: null, logoUrl: null, reviewed: true, manual: x,
  };
}

/** Today, yesterday and the first day the review inbox asks about, as calendar days on this device. */
export type Days = { today: string; yesterday: string; reviewFrom: string };
export function makeDays(now: Date): Days {
  const back = (n: number) => localTodayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
  return { today: localTodayKey(now), yesterday: back(1), reviewFrom: back(REVIEW_WINDOW_DAYS) };
}

/** "Nuevo": a saved bank movement nobody confirmed yet, inside the review window (same rule as review.count). */
export const isNew = (r: TxRow, days: Days) => !r.manual && r.id !== null && !r.reviewed && r.day >= days.reviewFrom;

/** "Hoy · 19 nov", "Ayer · 18 nov", "lun 17 nov" (upper-cased by CSS where the prototype does). */
export function dayLabel(day: string, date: unknown, days: Days, locale: string, words: { today: string; yesterday: string }): string {
  const short = txDay(date, locale).replace(/\./g, "");
  if (day === days.today) return `${words.today} · ${short}`;
  if (day === days.yesterday) return `${words.yesterday} · ${short}`;
  const wd = txDay(date, locale, { weekday: "short" }).replace(/[.,]/g, "");
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${short}`;
}

/** "Chase Total Checking ••4410" (a nickname wins over the bank's name). */
export function accountLabel(a: { name?: string | null; bankName?: string | null; nickname?: string | null; mask?: string | null; accountNumber?: string | null }, fallback: string): string {
  const mask = (a.mask ?? a.accountNumber ?? "").trim();
  const base = (a.nickname ?? "").trim() || displayAccountName(a.name ?? a.bankName ?? "", mask) || fallback;
  return mask ? `${base} ••${mask}` : base;
}

/** "hace 5 min" / "5 min ago" from an ISO time (now passed in, so render stays pure). */
export function relTime(iso: string | Date | null | undefined, now: number, locale: string, justNow: string): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const s = Math.round((t - now) / 1000);
  const a = Math.abs(s);
  if (a < 60) return justNow;
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86_400), "day");
}

/** Plain names for category keys: the personal labels first, then the bank screens' ones, then the key itself. */
export function useCatLabel() {
  const { categories } = useCopy(personalCopy);
  const mov = useCopy(movimientosCopy);
  return useMemo(() => (cat: string, type: string) => {
    const own = (type === "income" ? categories.income : categories.expense)[cat];
    return own ?? categories.short[cat] ?? mov.categories[cat] ?? budgetCategoryLabel(cat, {});
  }, [categories, mov]);
}

/** A bank's logo and look from brand.institutions (Plaid's logo and color), found by one of its account ids. */
export type Institution = { itemId: string; name: string; logo: string | null; color: string | null; accountIds: number[]; status: string;
  /** When Plaid last brought this bank's data (null: not known yet). */
  bankUpdatedAt?: string | null };
export function institutionOf(list: readonly Institution[] | undefined, accountId: number | null | undefined): Institution | null {
  if (!list || accountId === null || accountId === undefined) return null;
  return list.find((i) => i.accountIds.includes(Number(accountId))) ?? null;
}
/** Day totals and month sums: money out that isn't money coming in. */
export const sumOut = (rows: readonly TxRow[]) => rows.reduce((s, r) => s + (r.isIn ? 0 : r.amount), 0);
export const sumIn = (rows: readonly TxRow[]) => rows.reduce((s, r) => s + (r.isIn ? r.amount : 0), 0);

/** Prototype-style small button (.btn.sm). */
export const smBtn =
  "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60";
/** Prototype card (.card). */
export const card = "rounded-[14px] border border-slate-200 bg-white p-4";

/** One account as banks.overview sends it (kind, balance, nickname, card limit, its bank connection). */
export type OverviewAccount = inferRouterOutputs<AppRouter>["banks"]["overview"]["accounts"][number];

/** "Cuenta de cheques", "Tarjeta de crédito"…: from Plaid's type, and checking/savings from the account's own name. */
export function accountTypeLabel(a: Pick<OverviewAccount, "kind" | "type" | "name">, types: PersonalBankCopy["types"]): string {
  if (a.kind === "credit") return types.credit;
  if (a.kind === "loan") return types.loan;
  if (a.type === "investment") return types.investment;
  if (/sav|ahorro/i.test(a.name)) return types.savings;
  if (/check|cheque/i.test(a.name)) return types.checking;
  return types.depository;
}

/** The charge a month after the last one (a calendar day, in UTC); the 31st becomes the month's last day. */
export function nextMonthly(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

/** "A, B y C" / "A, B and C". */
export function listNames(names: readonly string[], and: string): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}

/** Video and music services people often pay twice for (the tip on the home looks for two or more). */
export const STREAMING = ["netflix", "disney", "hulu", "hbo", "max", "paramount", "peacock", "prime video", "amazon prime", "apple tv", "youtube premium", "youtube tv", "crunchyroll", "starz", "showtime", "spotify", "apple music"];
/** Whole word ("max" must not match "Maxwell"); inside a template string "\b" would be a backspace, so build it with \\b. */
export const isStreaming = (name: string) => STREAMING.some((s) => new RegExp(`\\b${s}\\b`, "i").test(name));
