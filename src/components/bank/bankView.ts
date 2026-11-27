// Shared bits for the business Bancos screen (src/pages/Bank.tsx and the cards in this folder).
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { displayAccountName } from "../../../api/lib/banks";
import type { BancosCopy } from "@/i18n/copy/bancos";

type Out = inferRouterOutputs<AppRouter>;
export type Overview = Out["banks"]["overview"];
export type OverviewAccount = Overview["accounts"][number];
export type AccountMonth = Out["banks"]["accountMonth"];
export type MonthMovement = AccountMonth["transactions"][number];

/** One bank connection as brand.institutions describes it (the logos system). */
export type Institution = Out["brand"]["institutions"][number];

/** What the screen knows about one bank: its name and logo, and whether it needs the owner to sign in again. */
export type BankInfo = { itemId: string; name: string; logo: string | null; color: string | null; needsReconnect: boolean; lastSuccessAt: string | null;
  /** How fresh this bank's balance is (balanceAt: Plaid's copy, or the bank itself when the app asked it). */
  bankUpdatedAt: string | null };

/**
 * How fresh a bank's balance is: when Plaid last brought the bank's data, or, when the app asked the bank itself
 * after that (Plaid Balance, api/lib/liveBalance.ts), that time. The newest of the two; null when neither is known.
 */
export function balanceAt(i: { bankUpdatedAt?: string | null; liveBalanceAt?: string | null } | null | undefined): string | null {
  const plaid = i?.bankUpdatedAt ?? null, live = i?.liveBalanceAt ?? null;
  if (!plaid || !live) return plaid ?? live;
  return Date.parse(live) > Date.parse(plaid) ? live : plaid;
}

const fmt = (n: number, digits: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** $1,234.56, with a real minus (−) when negative. */
export const money = (n: number) => `${n < 0 ? "−" : ""}$${fmt(n, 2)}`;
/** $1,235 (no cents), for amounts in a sentence. */
export const money0 = (n: number) => `${n < 0 ? "−" : ""}$${fmt(Math.round(n), 0)}`;
/** +$1,180 / −$420: the sign always shows. */
export const signed0 = (n: number) => `${n < 0 ? "−" : "+"}$${fmt(Math.round(n), 0)}`;

/** Today as the user's own calendar day (YYYY-MM-DD). Call from effects/handlers or memoized, not in render. */
export function localToday(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "21 nov" (es) or "Nov 21" (en) for a YYYY-MM-DD day. */
export function shortDay(iso: string, lang: "es" | "en", monthsShort: readonly string[]): string {
  const [, m, d] = iso.split("-").map(Number);
  if (!m || !d) return iso;
  const mon = monthsShort[m - 1] ?? "";
  return lang === "en" ? `${mon} ${d}` : `${d} ${mon.toLowerCase()}`;
}

/** "hace 5 min" from an ISO time, against `now` (ms). */
export function relTime(isoTime: string | null, now: number, rel: BancosCopy["rel"]): string | null {
  if (!isoTime) return null;
  const t = new Date(isoTime).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  if (mins < 1) return rel.now;
  if (mins < 60) return rel.min(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return rel.hours(hours);
  return rel.days(Math.floor(hours / 24));
}

/** The account's name on the card: the owner's nickname, else the bank's name without a repeated mask. */
export const accountName = (a: Pick<OverviewAccount, "name" | "nickname" | "mask">) => a.nickname || displayAccountName(a.name, a.mask) || a.name;

/** "Plaid Checking ••0000" */
export const accountTitle = (a: Pick<OverviewAccount, "name" | "nickname" | "mask">) => `${accountName(a)}${a.mask ? ` ••${a.mask}` : ""}`;

/** "Cheques", "Ahorros", "Tarjeta de crédito"… Plaid saves the account type; checking vs savings comes from the bank's own name. */
export function typeLabel(a: Pick<OverviewAccount, "type" | "name">, types: Record<string, string>): string {
  const type = a.type ?? "depository";
  if (type === "depository" || type === "") {
    if (/sav|ahorr/i.test(a.name)) return types.savings;
    if (/check|cheq/i.test(a.name)) return types.checking;
    return types.depository;
  }
  return types[type] ?? types.other;
}

/** Category label: this screen's own for the two kinds of transfer, else the app's (bank.ts), else the key made readable. */
export function categoryLabel(key: string, own: Record<string, string>, app: Record<string, string>): string {
  return own[key] || app[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

/** Where "Revisar N →" goes: Movimientos → Por revisar, filtered to the account. */
export const reviewLink = (accountId: number) => `/transactions?view=review&account=${accountId}`;

/** Prototype .btn.sm (taller on phone for the 44px tap target). */
export const BTN_SM = "inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-[11px] text-[13px] font-semibold text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 sm:min-h-[34px]";
export const BTN_SM_PRIMARY = "inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-blue-600 bg-blue-600 px-[11px] text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60 sm:min-h-[34px]";
