import { Link, Outlet, useLocation, useSearchParams } from "react-router";
import { Check, Lock, ShieldCheck, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { AuthShowcase } from "@/components/marketing/AuthShowcase";
import { SupportBubble } from "@/components/support/SupportBubble";
import { TRIAL_DAYS } from "@/components/marketing/content";
import { useCopy } from "@/i18n/useI18n";
import { authCopy } from "@/i18n/copy/auth";
import { useNoZoom } from "@/hooks/useNoZoom";
import { fx } from "@/lib/fx";

/** Split layout for /login, /register and /forgot-password. */
export default function AuthLayout() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { layout } = useCopy(authCopy);
  const c = layout.titles[pathname] ?? layout.defaultTitle;
  // Each page lists its own points (no free trial for someone signing in); the card follows Negocio / Personal.
  const benefits = (layout.benefitsFor[pathname] ?? layout.benefitsFor["/login"])(TRIAL_DAYS);
  const mode = pathname === "/register" && params.get("mode") === "personal" ? "personal" : "business";
  useNoZoom(); // No zoom on the sign-in pages (the app itself zooms).

  return (
    <div className="font-brand min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel (desktop) */}
      {/* Light, with the app itself on a computer and a phone, changing screens. */}
      {/* On first load it all comes in on one timeline: the color fades in from white, the glows light up, then the words and the devices. */}
      <aside className="relative hidden h-screen overflow-hidden lg:sticky lg:top-0 lg:flex lg:flex-col lg:gap-6 lg:p-10 xl:p-14">
        <div data-fx="fade" style={fx(0)} className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#F6F9FF] via-[#EEF4FF] to-[#E3ECFF]" />
        <div data-fx="glow" style={fx(150)} className="pointer-events-none absolute -right-32 -top-40 h-[460px] w-[460px] rounded-full bg-blue-400/20 blur-[110px]" />
        <div data-fx="glow" style={fx(420)} className="pointer-events-none absolute -bottom-40 -left-24 h-[380px] w-[380px] rounded-full bg-indigo-300/20 blur-[110px]" />

        <Link to="/" viewTransition data-fx="slide" style={fx(100)} className="relative inline-flex w-fit items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Logo className="h-9 w-9 text-blue-600" />
          <span className="block text-base font-semibold text-slate-900">Personal &amp; Business Solutions</span>
        </Link>

        <div key={pathname} className="relative max-w-xl">
          <h2 data-fx="focus" style={fx(180)} className="text-[2.1rem] font-bold leading-[1.1] tracking-tight text-slate-900 xl:text-[2.5rem]">{c.title}</h2>
          <p data-fx="rise" style={fx(300)} className="mt-3 text-base leading-relaxed text-slate-600 [@media(max-height:1000px)]:hidden">{c.text}</p>
          <ul className="mt-5 grid gap-2.5">
            {benefits.map((b, i) => (
              <li key={b} data-fx="slide" style={fx(380 + i * 85)} className="flex items-center gap-2.5 text-[15px] text-slate-700">
                <Check data-fx="pop" style={fx(470 + i * 85)} className="h-[18px] w-[18px] shrink-0 text-emerald-600" strokeWidth={2.6} aria-hidden="true" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Takes the space between the words and the bottom line; the devices size themselves to it. */}
        <div className="relative min-h-[220px] flex-1">
          <AuthShowcase mode={mode} />
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          {/* Bank-level security and the Plaid connection, in two clear chips (they open Seguridad). */}
          <Link to="/seguridad" viewTransition className="flex flex-wrap gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            {layout.trust.map((t, i) => (
              <span key={t} data-fx="grow" style={fx(1000 + i * 110)} className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[13px] font-medium text-slate-700 shadow-[0_4px_14px_-8px_rgba(30,58,138,0.35)] ring-1 ring-slate-200/80 backdrop-blur transition-colors hover:bg-white">
                {i === 0 ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />}{t}
              </span>
            ))}
          </Link>
          <p data-fx="fade" style={fx(1250)} className="text-xs text-slate-400">© {new Date().getFullYear()} Personal & Business Solutions</p>
        </div>
      </aside>

      {/* Form side */}
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-5 sm:px-10">
          <Link to="/" viewTransition data-fx="slide" style={fx(80)} className="inline-flex items-center gap-2 lg:hidden">
            <Logo className="h-8 w-8" />
            <span className="text-[15px] font-semibold text-slate-900">Personal &amp; Business Solutions</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {/* Close: back to the home page (the logo goes there too). */}
            <Link
              to="/"
              viewTransition
              data-fx="spin"
              style={fx(300)}
              aria-label={layout.close}
              title={layout.close}
              className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-[background-color,color,transform] duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <main className="flex flex-1 items-start justify-center px-5 pb-28 pt-4 sm:items-center sm:px-10 sm:pt-0">
          <div key={pathname} className="rise-stagger w-full max-w-[420px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Soporte 24/7, like on the site: it comes in last, with a little pop like the checks. */}
      <SupportBubble enterAt={1400} />
    </div>
  );
}
