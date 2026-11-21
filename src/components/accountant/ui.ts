// The 2.0 look for this folder's pieces (same classes as src/pages/Customers.tsx and the bank cards).
// Buttons and fields are 44px tall on phones and 40px from `sm` up.

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";
const base = `inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-60 sm:h-10 ${focus}`;

export const BTN = {
  primary: `${base} bg-blue-600 text-white shadow-sm hover:bg-blue-500`,
  secondary: `${base} border border-slate-200 bg-white text-slate-800 hover:bg-slate-50`,
  ghost: `${base} px-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900`,
  danger: `${base} bg-red-600 text-white hover:bg-red-700`,
  dangerOutline: `${base} border border-red-200 bg-white text-red-700 hover:bg-red-50`,
};

/** Overrides for the shadcn Input / SelectTrigger / Textarea. */
export const FIELD = "h-11 rounded-[10px] border-slate-200 bg-white text-base text-slate-900 shadow-none placeholder:text-slate-400 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30 sm:h-10 sm:text-sm";
export const LABEL = "text-sm font-medium text-slate-700";
export const CARD = "rounded-2xl border border-slate-200 bg-white p-4 sm:p-5";

/** Overrides for the shadcn Tabs: a segmented control, 44px tall on phones. */
export const TABS = {
  list: "h-auto w-full gap-1 rounded-xl bg-slate-100 p-1 sm:w-fit",
  trigger: "h-11 flex-1 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm sm:h-9 sm:flex-none sm:px-4",
};

/** "$1,234.50", or "−$1,234.50" with a real minus sign for negatives. */
export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : ""}$${abs}`;
}
