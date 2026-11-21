// Shared helpers for the Reports page pieces (src/pages/Reports.tsx, src/components/reports/*).
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";

type Out = inferRouterOutputs<AppRouter>;
export type IncomeStatement = Out["reports"]["incomeStatement"];
export type BalanceSheet = Out["reports"]["balanceSheet"];
/** One journal entry with its lines (the server's rows come from the untyped db, so spelled out here). */
export type JournalEntry = {
  id: number;
  entryNumber: string;
  date: Date | string | null;
  description: string;
  debitTotal: string | number;
  creditTotal: string | number;
  lines: Array<{
    id: number | null;
    accountCode: string | null;
    accountName: string | null;
    debit: string | number | null;
    credit: string | number | null;
    description: string | null;
  }>;
};
export type MonthlyData = Out["dashboard"]["monthly"];
export type PaymentRow = MonthlyData["paymentBreakdown"][number];
export type DailyRow = MonthlyData["dailySales"][number];

export type Period = "today" | "week" | "month" | "year";

/** One sale as dashboard.monthly sends it (the server types it loosely). */
export type SaleRow = {
  id: number;
  invoiceNumber?: string | null;
  total: string | number;
  paymentMethod: string;
  status: string;
  customerName?: string | null;
  createdAt: string | Date;
  items?: Array<{ serviceName?: string | null }>;
};

/** A bank account as listAccounts / getAllPlaidAccounts send it. */
export type BankAccountRow = {
  id: number;
  bankName?: string | null;
  accountType?: string | null;
  accountNumber?: string | null;
  currentBalance?: string | number | null;
  plaidAccountId?: string | null;
};

/** One month of the year chart: what came in, what went out and what was left. */
export type MonthTotals = { month: number; label: string; long: string; in: number; out: number; net: number };

/** The 2.0 card. */
export const CARD = "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5";

/** Chart colors, validated with the dataviz palette checker (emerald in, red out; CVD ΔE 9.6 on white). */
export const CHART = {
  in: "#059669", // emerald-600
  out: "#ef4444", // red-500
  accent: "#2563eb", // blue-600
  rest: "#cbd5e1", // slate-300 (de-emphasis)
  grid: "#e2e8f0", // slate-200
  axis: "#64748b", // slate-500
  hover: "#f1f5f9", // slate-100
} as const;

/** Any server number (DECIMAL strings, counts, null) as a finite number. */
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** "$1,234.56", with a real minus sign (−) for negatives. */
export function money(n: number, cents = true): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  return `${n < -0.004 ? "−" : ""}$${abs}`;
}

/** Axis ticks: $0, $500, $1.5K, $12K. */
export function moneyTick(n: number): string {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** 0.324 → "32.4 %" / "32,4 %" in the UI language. */
export function percent(fraction: number, locale: string): string {
  return fraction.toLocaleString(locale, { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "2026-11-05" as a local date (no time zone shift). */
export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** First and last day of a month as "YYYY-MM-DD". */
export function monthRange(year: number, month: number) {
  const last = new Date(year, month, 0).getDate();
  return { startDate: `${year}-${pad(month)}-01`, endDate: `${year}-${pad(month)}-${pad(last)}` };
}

export const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
