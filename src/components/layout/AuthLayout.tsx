import { Link, Outlet, useLocation } from "react-router";
import { ArrowLeft, Check } from "lucide-react";
import { Logo } from "@/components/Logo";
import { MiniInsightCard } from "@/components/marketing/Previews";
import { TRIAL_DAYS } from "@/components/marketing/content";
import { useCopy } from "@/i18n/useI18n";
import { authCopy } from "@/i18n/copy/auth";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

/** Split layout for /login, /register and /forgot-password. */
export default function AuthLayout() {
  const { pathname } = useLocation();
  const { layout } = useCopy(authCopy);
  const c = layout.titles[pathname] ?? layout.defaultTitle;

  return (
    <div className="font-brand min-h-screen bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden h-screen overflow-hidden bg-[#060B18] lg:sticky lg:top-0 lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="bg-grid-dark pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black_25%,transparent_70%)]" />
        <div className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-blue-600/25 blur-[120px]" />

        <Link to="/" className="relative inline-flex w-fit items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
          <Logo className="h-9 w-9" />
          <span className="leading-tight">
            <span className="block text-base font-semibold text-white">Personal &amp; Business Solutions</span>
          </span>
        </Link>

        <div key={pathname} className="relative max-w-md animate-in fade-in slide-in-from-bottom-2 duration-700">
          <h2 className="text-4xl font-bold leading-[1.1] tracking-tight text-white xl:text-[2.6rem]">{c.title}</h2>
          <p className="mt-5 text-lg leading-relaxed text-slate-400">{c.text}</p>
          <ul className="mt-8 space-y-3">
            {layout.benefits(TRIAL_DAYS).map((b) => (
              <li key={b} className="flex items-center gap-3 text-[15px] text-slate-300">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15"><Check className="h-3.5 w-3.5 text-emerald-400" /></span>
                {b}
              </li>
            ))}
          </ul>
          <div className="mt-10 animate-soft-float">
            <MiniInsightCard />
          </div>
        </div>

        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} Personal & Business Solutions</p>
      </aside>

      {/* Form side */}
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-5 sm:px-10">
          <Link to="/" className="inline-flex items-center gap-2 lg:hidden">
            <Logo className="h-8 w-8" />
            <span className="text-[15px] font-semibold text-slate-900">Personal &amp; Business Solutions</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              to="/"
              aria-label={layout.back}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{layout.back}</span>
            </Link>
          </div>
        </div>
        <main className="flex flex-1 items-start justify-center px-5 pb-14 pt-4 sm:items-center sm:px-10 sm:pt-0">
          <div key={pathname} className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-3 duration-500">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
