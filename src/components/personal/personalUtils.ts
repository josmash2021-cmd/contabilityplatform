// Shared bits for the 2.0 personal pages (movements, budgets, goals, subscriptions, category detail).
// The category icon and tone idea and the date handling are copied from the personal home
// (src/pages/PersonalDashboard.tsx), not imported from it.
import {
  ArrowDownRight, ArrowUpRight, Banknote, Building2, Car, CircleDollarSign, Cloud, CreditCard, Dumbbell, FileBadge, Film, Fuel, HandCoins,
  HeartPulse, House, Music, Newspaper, ParkingCircle, Receipt, RotateCcw, Send, Shield, ShieldPlus, ShoppingBag, Smartphone, TrendingUp, Tv,
  Utensils, Wifi, Zap, type LucideIcon,
} from "lucide-react";
import { isCarWash } from "../../../api/lib/bankRules";

export type CatStyle = { icon: LucideIcon; tone: string };

const CAT_STYLE: Record<string, CatStyle> = {
  zelle_income: { icon: Send, tone: "bg-purple-50 text-purple-600" },
  transfer_income: { icon: ArrowUpRight, tone: "bg-sky-50 text-sky-600" },
  deposit: { icon: Building2, tone: "bg-blue-50 text-blue-600" },
  cash_deposit: { icon: Banknote, tone: "bg-amber-50 text-amber-600" },
  cash_income: { icon: CircleDollarSign, tone: "bg-emerald-50 text-emerald-600" },
  income: { icon: TrendingUp, tone: "bg-emerald-50 text-emerald-600" },
  general: { icon: TrendingUp, tone: "bg-emerald-50 text-emerald-600" },
  paycheck: { icon: Banknote, tone: "bg-blue-50 text-blue-600" },
  refund: { icon: RotateCcw, tone: "bg-emerald-50 text-emerald-600" },
  zelle_sent: { icon: Send, tone: "bg-purple-50 text-purple-600" },
  cash_withdrawal: { icon: Banknote, tone: "bg-amber-50 text-amber-600" },
  subscription: { icon: Tv, tone: "bg-pink-50 text-pink-600" },
  shopping: { icon: ShoppingBag, tone: "bg-violet-50 text-violet-600" },
  home_expense: { icon: Utensils, tone: "bg-orange-50 text-orange-600" },
  business_expense: { icon: Receipt, tone: "bg-slate-100 text-slate-600" },
  gasolina: { icon: Fuel, tone: "bg-orange-50 text-orange-600" },
  medical: { icon: HeartPulse, tone: "bg-red-50 text-red-600" },
  food: { icon: Utensils, tone: "bg-orange-50 text-orange-600" },
  card_payment: { icon: CreditCard, tone: "bg-sky-50 text-sky-600" },
  loan: { icon: HandCoins, tone: "bg-amber-50 text-amber-600" },
  rent: { icon: House, tone: "bg-indigo-50 text-indigo-600" },
  utilities: { icon: Zap, tone: "bg-yellow-50 text-yellow-600" },
  insurance: { icon: Shield, tone: "bg-violet-50 text-violet-600" },
  health_insurance: { icon: ShieldPlus, tone: "bg-rose-50 text-rose-600" },
  government: { icon: FileBadge, tone: "bg-slate-100 text-slate-600" },
};

/** Icon and tone for a category key; a plain arrow or receipt when the key is unknown. */
export function styleOf(cat: string | null | undefined, type: string | null | undefined): CatStyle {
  const known = cat ? CAT_STYLE[cat] : undefined;
  if (known) return known;
  if (cat === "transfer") return type === "income" ? CAT_STYLE.transfer_income : { icon: ArrowDownRight, tone: "bg-slate-100 text-slate-600" };
  return type === "income" ? { icon: ArrowUpRight, tone: "bg-emerald-50 text-emerald-600" } : { icon: Receipt, tone: "bg-slate-100 text-slate-600" };
}

/** Icon and tone for a recurring charge, from the merchant's name. */
export function subStyleOf(name: string): CatStyle {
  const n = name.toLowerCase();
  const has = (...words: string[]) => words.some((w) => n.includes(w));
  if (has("netflix")) return { icon: Film, tone: "bg-red-50 text-red-600" };
  if (has("spotify", "apple music", "youtube music")) return { icon: Music, tone: "bg-green-50 text-green-600" };
  if (has("disney", "hulu", "hbo", "paramount", "peacock", "prime", "crunchyroll", "twitch", "youtube tv", "starz", "showtime")) return { icon: Tv, tone: "bg-blue-50 text-blue-600" };
  if (has("verizon", "at&t", "t-mobile", "tmobile", "sprint", "cricket", "metro", "boost", "mint", "visible")) return { icon: Smartphone, tone: "bg-indigo-50 text-indigo-600" };
  if (has("comcast", "xfinity", "spectrum", "cox", "fios", "frontier", "centurylink")) return { icon: Wifi, tone: "bg-sky-50 text-sky-600" };
  if (has("geico", "state farm", "progressive", "allstate", "farmers", "nationwide", "usaa", "blue cross", "anthem", "aetna", "cigna", "humana", "kaiser")) return { icon: Shield, tone: "bg-violet-50 text-violet-600" };
  if (isCarWash(n) || has("self serve wash", "zips car", "mister car", "brown bear", "super wash")) return { icon: Car, tone: "bg-cyan-50 text-cyan-600" };
  if (has("ezpass", "sunpass", "toll")) return { icon: ParkingCircle, tone: "bg-orange-50 text-orange-600" };
  if (has("planet fit", "la fitness", "equinox", "crunch", "ymca", "orange theory", "soulcycle", "peloton", "gym", "fitness", "24 hour", "gold gym")) return { icon: Dumbbell, tone: "bg-emerald-50 text-emerald-600" };
  if (has("adobe", "microsoft", "office 365", "google one", "icloud", "dropbox", "slack", "zoom", "canva", "chatgpt", "openai", "kimi", "claude", "anthropic", "midjourney")) return { icon: Cloud, tone: "bg-purple-50 text-purple-600" };
  if (has("new york times", "wall street", "washington post", "medium", "substack", "patreon")) return { icon: Newspaper, tone: "bg-pink-50 text-pink-600" };
  if (has("affirm", "klarna", "afterpay")) return { icon: CreditCard, tone: "bg-amber-50 text-amber-600" };
  return { icon: CreditCard, tone: "bg-slate-100 text-slate-600" };
}

/** A number from a decimal string, a number or nothing; 0 when it isn't one. */
export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** "$1,234" or "$1,234.50"; negatives get a real minus sign (−). */
export const money = (n: number, cents = false) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })}`;

/** Money with cents only when it has them: "$250", "$15.49". */
export const moneyAuto = (n: number) => money(n, Math.round(n * 100) % 100 !== 0);

/** Whole dollars without cents ("500"), otherwise two decimals ("499.50"): what goes in an amount input. */
export function amountInput(n: number | null): string {
  if (n === null || !(n > 0)) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** "+$60.00" for money in, "−$48.20" for money out. */
export const signed = (n: number, isIn: boolean) => `${isIn ? "+" : "−"}${money(Math.abs(n), true)}`;

export const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Plaid dates (and DATE columns) are calendar days sent as midnight: read them in UTC so they don't slip a day. */
export function asDate(d: unknown): Date | null {
  if (d === null || d === undefined || d === "") return null;
  const date = d instanceof Date ? d : new Date(d as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "15 nov" / "Nov 15" for a calendar day. */
export const txDay = (d: unknown, locale: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => {
  const date = asDate(d);
  return date ? date.toLocaleDateString(locale, { ...opts, timeZone: "UTC" }) : "";
};

/** "2026-11-15" for a calendar day, read in UTC. */
export function dayKey(d: unknown): string {
  const date = asDate(d);
  return date ? date.toISOString().slice(0, 10) : "";
}

/** Today's date on the person's device as "2026-11-21" (call it from handlers or memos, not during render). */
export function localTodayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export type YearMonth = { y: number; m: number };
export const monthIndex = (p: YearMonth) => p.y * 12 + (p.m - 1);
export const fromMonthIndex = (i: number): YearMonth => ({ y: Math.floor(i / 12), m: (i % 12) + 1 });

/** "Noviembre de 2026" / "November 2026". */
export const monthLabel = (p: YearMonth, locale: string) =>
  upperFirst(new Date(Date.UTC(p.y, p.m - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" }));

/** "noviembre" / "November". */
export const monthOnly = (p: YearMonth, locale: string) =>
  new Date(Date.UTC(p.y, p.m - 1, 1)).toLocaleDateString(locale, { month: "long", timeZone: "UTC" });

/** Plaid reports what you owe on cards and loans as their balance. */
export const isDebt = (type?: string | null) => type === "credit" || type === "loan";

/** A bank account as listAccounts / getAllPlaidAccounts send it. */
export type PersonalAccount = {
  id: number;
  bankName: string | null;
  accountType: string | null;
  accountNumber?: string | null;
  currentBalance: string | null;
  plaidAccountId?: string | null;
};

/** "Regions Checking ···4821". */
export const accountName = (a: Pick<PersonalAccount, "bankName" | "accountNumber">, fallback: string) =>
  `${a.bankName || fallback}${a.accountNumber ? ` ···${a.accountNumber}` : ""}`;

/** A bank movement from bank.getMonthData or bank.listByCategory (Plaid rows may have no numeric id). */
export type BankTx = {
  id?: number | string;
  plaidTransactionId?: string | null;
  description: string | null;
  amount: string | number;
  type: string;
  category: string | null;
  transactionDate?: string | Date | null;
  bankName?: string | null;
  bankAccountId?: number | null;
  importedFrom?: string | null;
  isReversed?: boolean;
};

/** A saving goal from personal.listGoals. */
export type Goal = {
  id: number;
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline: string | Date | null;
  category: string | null;
  isActive: boolean | null;
  createdAt?: string | Date | null;
};

/** A movement the person added by hand (personal.listTransactions). */
export type ManualTx = {
  id: number;
  description: string;
  amount: string;
  type: "income" | "expense";
  category: string;
  paymentMethod: PaymentMethod;
  transactionDate: string | Date;
  notes: string | null;
};

export const PAYMENT_METHODS = ["cash", "card", "transfer", "zelle", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Categories offered when adding a movement by hand (keys are the same as bank movements). */
export const MANUAL_CATEGORIES = {
  expense: ["food", "home_expense", "shopping", "gasolina", "medical", "subscription", "zelle_sent", "transfer", "business_expense", "other"],
  income: ["paycheck", "cash_income", "zelle_income", "transfer_income", "deposit", "income"],
} as const;

/** Class names the personal pages share (2.0 look: slate neutrals, blue-600 accent, 44px targets on phone). */
export const ui = {
  card: "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5",
  primary:
    "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:h-10",
  secondary:
    "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 sm:h-10",
  danger:
    "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:h-10",
  control:
    "h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-base text-slate-900 focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:h-10 sm:text-sm",
  label: "mb-1.5 block text-sm font-medium text-slate-700",
  chip: (active: boolean) =>
    `h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9 ${
      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`,
};
