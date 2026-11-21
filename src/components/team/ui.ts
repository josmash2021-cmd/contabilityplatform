// Class names for the prototype's building blocks on the team screens (.btn, .card, .dst…).
import {
  BarChart3, BookOpen, Camera, ClipboardList, FileText, Home, Inbox, Landmark, Settings, ShoppingCart, Sparkles, Tag, Truck, Users, UsersRound, Wallet,
  type LucideIcon,
} from "lucide-react";

export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";
export const CARD = "rounded-[14px] border border-slate-200 bg-white p-4";
export const BTN = `inline-flex min-h-10 items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;
export const BTN_PRIMARY = `inline-flex min-h-10 items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border border-blue-600 bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;
export const BTN_SM = `inline-flex min-h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-[11px] py-1.5 text-[13px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;
export const INPUT = "min-h-10 w-full rounded-[10px] border border-slate-200 bg-white px-2.5 py-2 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-[3px] focus:ring-blue-50 sm:text-sm";

/** The prototype's status dot + label (.dst). */
export const DST = "inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold";
export const DST_TONE = { good: "text-emerald-600", warn: "text-amber-700", open: "text-blue-600", muted: "text-slate-500", bad: "text-red-600" } as const;

/** The same icons the side menu uses for each section. */
export const PATH_ICON: Record<string, LucideIcon> = {
  "/": Home, "/transactions": Inbox, "/pos": ShoppingCart, "/invoices": FileText, "/expenses": Wallet, "/quotes": ClipboardList, "/customers": Users, "/services": Tag,
  "/receipts": Camera, "/vendors": Truck, "/bank": Landmark, "/reports": BarChart3, "/accountant": BookOpen, "/taxes": FileText,
  "/assistant": Sparkles, "/team": UsersRound, "/settings": Settings,
};

/** "Taller López" → "TL" (the logo square when there's no logo). */
export function initialsOf(name: string | null | undefined): string {
  return String(name ?? "").split(/\s+/).filter((w) => w && !/\.$/.test(w)).slice(0, 2).map((w) => w.charAt(0)).join("").toUpperCase();
}

/** "María López" → "María"; "Lic. Ramírez" stays whole. */
export function firstOf(name: string | null | undefined): string {
  const s = String(name ?? "").trim();
  const first = s.split(/\s+/)[0] ?? "";
  return /\.$/.test(first) ? s : first;
}

/** For an input that only shows a value (the login email, the invited email). */
export const READONLY = "bg-slate-100 text-slate-500";
