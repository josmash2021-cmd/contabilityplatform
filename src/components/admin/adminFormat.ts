// Labels shared by the admin pages: plan and money, "5 min ago", initials, the tone of a status.
// The status comes from the server (api/lib/adminOverview.ts userStatus), the same rule for every count.
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import type { UserStatus } from "../../../api/lib/adminOverview";
import { intlLocale, type Lang } from "@/i18n/lang";
import type { AdminCopy } from "@/i18n/copy/admin";

export type AdminOut = inferRouterOutputs<AppRouter>["admin"];
export type { UserStatus };

/** "$80", "$33.33": no cents when it's whole. */
export function fmtMoney(n: number, lang: Lang): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return new Intl.NumberFormat(intlLocale(lang), { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(n);
}

/** "hace 5 min", "ayer", "5 min ago". */
export function timeAgo(d: Date | string | null | undefined, lang: Lang, t: AdminCopy, now = Date.now()): string {
  if (!d) return t.ago.never;
  const sec = Math.round((new Date(d).getTime() - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 45) return t.ago.now;
  const rtf = new Intl.RelativeTimeFormat(lang === "es" ? "es" : "en", { numeric: "auto", style: "short" });
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(sec / 3600), "hour");
  if (abs < 86_400 * 7) return rtf.format(Math.round(sec / 86_400), "day");
  if (abs < 86_400 * 35) return rtf.format(Math.round(sec / (86_400 * 7)), "week");
  return rtf.format(Math.round(sec / (86_400 * 30)), "month");
}

/** "23 de noviembre", "November 23". */
export function fmtDay(d: Date | string, lang: Lang, withYear = false): string {
  return new Intl.DateTimeFormat(intlLocale(lang), { month: "long", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "America/Chicago" }).format(new Date(d));
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** "Pro · $80/mes", "Prueba gratis", "Básico · gratis". */
export function planLabel(s: UserStatus, mode: "business" | "personal", t: AdminCopy, lang: Lang): string {
  switch (s.kind) {
    case "paying": {
      const tier = s.tier ? t.plan.tiers[s.tier] : "";
      const price = s.amount ? `${fmtMoney(s.amount, lang)}${s.plan === "annual" ? t.plan.perYear : t.plan.perMonth}` : t.plan[s.plan];
      return tier ? `${tier} · ${price}` : price;
    }
    case "failed": {
      const price = `${fmtMoney(s.amount, lang)}${s.plan === "annual" ? t.plan.perYear : t.plan.perMonth}`;
      return s.tier ? `${t.plan.tiers[s.tier]} · ${price}` : price;
    }
    case "trial": return t.plan.trial;
    case "gift": return `${t.plan.gift} · ${t.plan[s.plan]}`;
    case "free": return t.plan.free;
    case "admin": return "—";
    default: return mode === "personal" ? t.plan.free : t.plan.none;
  }
}

export const TONE: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-slate-100 text-slate-600",
  violet: "bg-violet-50 text-violet-700",
};
export const DOT: Record<string, string> = { blue: "bg-blue-600", amber: "bg-amber-600", green: "bg-emerald-600", red: "bg-red-600", gray: "bg-slate-500", violet: "bg-violet-600" };

export function statusInfo(s: UserStatus, t: AdminCopy): { label: string; tone: keyof typeof TONE } {
  switch (s.kind) {
    case "trial": return { label: t.status.trial(s.daysLeft), tone: s.daysLeft <= 3 ? "amber" : "blue" };
    case "paying": return { label: s.cancels ? t.status.cancels : t.status.paying, tone: s.cancels ? "amber" : "green" };
    case "gift": return { label: t.status.gift, tone: "violet" };
    case "failed": return { label: t.status.failed, tone: "red" };
    case "blocked": return { label: t.status.blocked, tone: "red" };
    case "admin": return { label: t.status.admin, tone: "gray" };
    case "free": return { label: t.status.free, tone: "gray" };
    case "canceled": return { label: t.status.canceled, tone: "gray" };
    default: return { label: t.status.ended, tone: "gray" };
  }
}

