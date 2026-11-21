// The prototype's building blocks for Cobrar, Clientes and Productos y servicios, as Tailwind classes:
// .btn, .card, .slist/.srow, .conn-search, .money-in, .seg, .note.
// Phones get 44px tap targets; from `sm` up, buttons keep the prototype's 40px / 34px.
import { cn } from "@/lib/utils";

export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";

const BTN_BASE = `inline-flex min-h-11 items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 sm:min-h-10 ${FOCUS}`;
const BTN_VARIANTS = {
  primary: "border-blue-600 bg-blue-600 text-white hover:bg-blue-600 hover:brightness-110",
  sm: "sm:min-h-[34px] px-[11px] py-1.5 text-[13px]",
  big: "min-h-[46px] text-[15px] sm:min-h-[46px]",
  icon: "w-11 px-0 sm:w-10",
  locked: "border-dashed bg-slate-100 text-slate-500 hover:bg-slate-100",
  danger: "border-red-600 bg-red-600 text-white hover:bg-red-600 hover:brightness-110",
};
export type BtnVariant = keyof typeof BTN_VARIANTS;

/** `.btn` plus variants: btn("primary", "sm"). */
export function btn(...variants: Array<BtnVariant | false | null | undefined | string>): string {
  return cn(BTN_BASE, ...variants.map((v) => (v && v in BTN_VARIANTS ? BTN_VARIANTS[v as BtnVariant] : v)));
}

/** `.linkbtn` */
export const LINK_BTN = `inline-flex min-h-11 items-center rounded text-sm font-semibold text-blue-600 hover:text-blue-700 sm:min-h-0 ${FOCUS}`;

/** `.card` */
export const CARD = "min-w-0 rounded-[14px] border border-slate-200 bg-white p-4";
export const CARD_TITLE = "text-[15px] font-bold text-slate-900";

/** `.slist`: the bordered list that holds `.srow` rows. */
export const SLIST = "overflow-hidden rounded-[14px] border border-slate-200 bg-white";
/** `.srow.h`: the header row of a list. */
export const SROW_HEAD = "bg-slate-100 px-4 py-[9px] text-xs font-semibold text-slate-500";

/** `.conn-search`: the search box with its icon. */
export const SEARCH_BOX =
  "flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 text-slate-500 transition focus-within:border-blue-600 focus-within:bg-white focus-within:shadow-[0_0_0_3px_#EFF6FF]";
export const SEARCH_INPUT = "min-w-0 flex-1 border-0 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-500 sm:text-[15px] [&::-webkit-search-cancel-button]:hidden";

/** Form fields (`.form input/select`): 44px on phones, 42px from `sm`. */
export const FIELD = `h-11 w-full rounded-[10px] border border-slate-200 bg-white px-2.5 text-base text-slate-900 placeholder:text-slate-400 sm:h-[42px] sm:text-sm ${FOCUS}`;
export const LABEL = "grid gap-1 text-[13px] font-semibold text-slate-900";

/** `.money-in input` (the "$" sits inside, on the left). */
export const MONEY_INPUT =
  "min-h-11 w-full rounded-[10px] border border-slate-200 bg-white py-1.5 pl-6 pr-3 text-base font-semibold tabular-nums text-slate-900 transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:shadow-[0_0_0_3px_#EFF6FF] sm:min-h-9 sm:text-[15px]";

/** `.seg`: the segmented control (Efectivo / Zelle / Tarjeta / Dividir). */
export const SEG = "grid rounded-xl border border-slate-200 bg-slate-100 p-[3px]";
export const segBtn = (on: boolean) =>
  cn(
    `min-h-11 rounded-[9px] px-1 text-[13px] font-semibold transition sm:min-h-9 ${FOCUS}`,
    on ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(11,18,32,0.14)]" : "text-slate-500 hover:text-slate-900",
  );

/** `.menu-title` */
export const MENU_TITLE = "mx-0.5 mb-1.5 mt-3.5 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500";
