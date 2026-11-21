// The prototype's class names in Tailwind (.btn, .linkbtn, .card, .form fields) for Facturas and Cotizaciones.
// Phones get 44px tap targets; from `sm` up, buttons keep the prototype's 40px / 34px.
import { cn } from "@/lib/utils";

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";

/** `.btn` and its variants. */
export const BTN = {
  base: `inline-flex min-h-11 items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 active:translate-y-px disabled:pointer-events-none disabled:opacity-45 sm:min-h-10 ${focus}`,
  primary: "border-blue-600 bg-blue-600 text-white hover:bg-blue-600 hover:brightness-110",
  danger: "border-red-600 bg-red-600 text-white hover:bg-red-600 hover:brightness-110",
  sm: "sm:min-h-[34px] px-[11px] py-1.5 text-[13px]",
  locked: "border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-100",
  icon: "px-[9px]",
};

export const btn = (...variants: Array<keyof typeof BTN | false | null | undefined | string>) =>
  cn(BTN.base, ...variants.map((v) => (v && v in BTN ? BTN[v as keyof typeof BTN] : v)));

/** `.linkbtn` */
export const LINK_BTN = `inline-flex min-h-11 items-center rounded font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700 sm:min-h-0 ${focus}`;

/** `.card` */
export const CARD = "min-w-0 rounded-[14px] border border-slate-200 bg-white p-4";

/** Fields inside forms (`.form input/select`): 44px on phones, 42px from `sm`. */
export const FIELD = `h-11 w-full rounded-[10px] border border-slate-200 bg-white px-2.5 text-base text-slate-900 placeholder:text-slate-400 sm:h-[42px] sm:text-sm ${focus}`;
export const LABEL = "grid gap-1 text-[13px] font-semibold text-slate-900";

