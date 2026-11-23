import { useEffect, useState, type CSSProperties } from "react";
import { Link, NavLink } from "react-router";
import { Menu, X, ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useCopy } from "@/i18n/useI18n";
import { marketingCopy } from "@/i18n/copy/marketing";
import { TRIAL_DAYS } from "./content";

/** Sticky top navigation. Transparent over the dark hero, solid once you scroll. */
export function MarketingNav() {
  const { nav } = useCopy(marketingCopy);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu with Escape and lock page scroll while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const solid = scrolled || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid ? "bg-white border-b border-slate-200/80 shadow-[0_1px_12px_rgba(15,23,42,0.06)]" : "bg-transparent"
      }`}
    >
      <nav aria-label={nav.label} className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={() => setOpen(false)}>
          <Logo className={`h-8 w-8 transition-colors ${solid ? "text-blue-600" : "text-blue-400"}`} />
          <span className="leading-tight">
            <span className={`block text-[15px] font-semibold tracking-tight transition-colors ${solid ? "text-slate-900" : "text-white"}`}>Personal &amp; Business Solutions</span>
          </span>
        </Link>

        <ul className="hidden items-center gap-1 xl:flex">
          {nav.links.map((l) => (
            <li key={l.href}>
              <NavLink
                to={l.href}
                className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  solid
                    ? isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    : isActive ? "bg-white/10 text-white" : "text-slate-300 hover:text-white hover:bg-white/10"
                }`}
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 xl:flex">
          <Link
            to="/login"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              solid ? "text-slate-700 hover:bg-slate-100" : "text-white hover:bg-white/10"
            }`}
          >
            {nav.login}
          </Link>
          <Link
            to="/register"
            className="group inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            {nav.cta(TRIAL_DAYS)}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          type="button"
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors xl:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            solid ? "text-slate-900 hover:bg-slate-100" : "text-white hover:bg-white/10"
          }`}
          aria-label={open ? nav.closeMenu : nav.openMenu}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {/* The three lines turn into the X (and back), never a jump. */}
          <span className="relative h-5 w-5" aria-hidden>
            <Menu className={`absolute inset-0 h-5 w-5 transition-[transform,opacity] duration-300 ease-out ${open ? "rotate-90 scale-50 opacity-0" : "opacity-100"}`} />
            <X className={`absolute inset-0 h-5 w-5 transition-[transform,opacity] duration-300 ease-out ${open ? "opacity-100" : "-rotate-90 scale-50 opacity-0"}`} />
          </span>
        </button>
      </nav>

      {/* Behind the open menu the page dims and blurs a little; tapping it closes the menu. */}
      <div aria-hidden onClick={() => setOpen(false)} className={`mm-veil xl:hidden ${open ? "mm-on" : ""}`} />

      {/* Mobile menu: it grows to its own height and back (index.css .mm-panel), the options come in one by one. */}
      <div id="mobile-menu" inert={!open} className={`mm-panel relative xl:hidden ${open ? "mm-open" : ""}`}>
        <div className="min-h-0 overflow-hidden">
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-slate-200 bg-white">
        <ul className="space-y-1 px-4 pb-4 pt-3">
          {nav.links.map((l, i) => (
            <li key={l.href} className="mm-item" style={{ "--i": i } as CSSProperties}>
              <NavLink
                to={l.href}
                onClick={() => setOpen(false)}
                className={({ isActive }) => `block rounded-lg px-3 py-3 text-base font-medium hover:bg-slate-50 hover:text-slate-900 ${isActive ? "bg-slate-100 text-slate-900" : "text-slate-700"}`}
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mm-item grid gap-2 border-t border-slate-100 px-4 py-4" style={{ "--i": nav.links.length } as CSSProperties}>
          <Link to="/register" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-500">
            {nav.cta(TRIAL_DAYS)} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/login" className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 text-base font-medium text-slate-800 hover:bg-slate-50">
            {nav.login}
          </Link>
        </div>
        </div>
        </div>
      </div>
    </header>
  );
}
