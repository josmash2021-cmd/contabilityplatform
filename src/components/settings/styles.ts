// Class names for the prototype's building blocks on the settings screen (.btn, .inp, .set-sub…).
export const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";
/** The prototype's .inp */
export const INP = "min-h-10 w-full rounded-[10px] border border-slate-200 bg-white px-2.5 py-2 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-[3px] focus:ring-blue-50 disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm";
export const BTN = `inline-flex min-h-10 items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;
export const BTN_PRIMARY = `inline-flex min-h-10 items-center justify-center gap-[7px] whitespace-nowrap rounded-[10px] border border-blue-600 bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;
export const BTN_SM = `inline-flex min-h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-[11px] py-1.5 text-[13px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;
/** A section's small uppercase subtitle (.set-sub). */
export const SET_SUB = "mb-0.5 mt-4 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500";

/** For an input that only shows a value (the login email, the invited email). */
export const READONLY = "bg-slate-100 text-slate-500";
