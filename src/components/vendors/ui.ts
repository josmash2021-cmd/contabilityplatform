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


/** The prototype's tables: bills (.srow.bill) and vendors (.srow.vend); phones get two columns. */
export const BILL_GRID = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1 md:grid-cols-[minmax(0,1fr)_190px_110px_110px_180px]";
export const VEND_GRID = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3.5 gap-y-1 md:grid-cols-[minmax(0,1fr)_110px_110px_100px]";
