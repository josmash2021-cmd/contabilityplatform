// The phone the site draws the app in: titanium edge, side buttons, island, status bar and home indicator.
// Used by the home page (Previews.tsx) and by "Un día con la app" (/como-funciona).
import type { ReactNode, Ref } from "react";

/** The phone's top bar: time, signal, Wi-Fi and battery. */
export function PhoneStatusBar() {
  return (
    <div className="relative z-10 grid h-[46px] grid-cols-[1fr_108px_1fr] items-center bg-white px-2 pt-1 text-[13px] font-semibold text-black" aria-hidden>
      <span className="justify-self-center tabular-nums">9:41</span>
      <span />
      <span className="flex items-center gap-[5px] justify-self-center">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.6" y="5" width="3" height="6" rx="1" /><rect x="9.2" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.8" y="0" width="3" height="11" rx="1" /></svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 2.3c2.1 0 4 .8 5.5 2.1l1.1-1.2A9.7 9.7 0 0 0 7.5.7 9.7 9.7 0 0 0 .9 3.2L2 4.4a8 8 0 0 1 5.5-2.1Z" /><path d="M7.5 5.5c1.2 0 2.3.4 3.2 1.2l1.1-1.2a6.4 6.4 0 0 0-8.6 0l1.1 1.2c.9-.8 2-1.2 3.2-1.2Z" /><path d="M7.5 8.5c.5 0 .9.2 1.2.5L7.5 10.3 6.3 9c.3-.3.7-.5 1.2-.5Z" /></svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.5" y="0.5" width="21" height="11" rx="3.3" stroke="currentColor" strokeOpacity=".35" /><rect x="2" y="2" width="16.5" height="8" rx="2" fill="currentColor" /><path d="M23 4.2v3.6c.8-.3 1.3-1 1.3-1.8S23.8 4.5 23 4.2Z" fill="currentColor" fillOpacity=".4" /></svg>
      </span>
    </div>
  );
}

const sideButton = "absolute w-[4px] bg-gradient-to-b from-slate-400 via-slate-600 to-slate-500";

/**
 * The phone's body around a screen. `screen` is the white screen (its own height and contents);
 * the island and the home indicator sit on top of it.
 */
export function PhoneCase({ label, viewRef, children }: { label: string; viewRef?: Ref<HTMLDivElement>; children: ReactNode }) {
  return (
    <div ref={viewRef} className="relative mx-auto w-[292px] sm:w-[312px]" role="img" aria-label={label}>
      <span aria-hidden className={`${sideButton} -left-[3px] top-[112px] h-7 rounded-l-md`} />
      <span aria-hidden className={`${sideButton} -left-[3px] top-[158px] h-12 rounded-l-md`} />
      <span aria-hidden className={`${sideButton} -left-[3px] top-[218px] h-12 rounded-l-md`} />
      <span aria-hidden className={`${sideButton} -right-[3px] top-[178px] h-[76px] rounded-r-md`} />
      <div className="rounded-[3.3rem] bg-gradient-to-br from-slate-300 via-slate-600 to-slate-400 p-[2px] shadow-[0_45px_90px_-30px_rgba(15,23,42,0.65)]">
        <div className="rounded-[3.2rem] bg-[#0b0d12] p-[11px]">{children}</div>
      </div>
    </div>
  );
}

/** The island and the home indicator, drawn over the screen. */
export function PhoneChrome() {
  return (
    <>
      <div aria-hidden className="absolute left-1/2 top-[11px] z-20 h-[28px] w-[98px] -translate-x-1/2 rounded-full bg-black" />
      <div aria-hidden className="absolute bottom-1.5 left-1/2 z-20 h-[5px] w-[122px] -translate-x-1/2 rounded-full bg-black/85" />
    </>
  );
}
