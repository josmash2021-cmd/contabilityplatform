import { useState, useEffect, useRef } from "react";
import { Outlet } from "react-router";
import { Logo } from "@/components/Logo";

export default function AuthLayout() {
  const contentRef = useRef<HTMLDivElement>(null);
  // Mobile: content is always visible (scroll naturally reveals it)
  // Desktop: use IntersectionObserver for elegant fade-in
  const [contentVisible, setContentVisible] = useState(true);

  useEffect(() => {
    // Only apply observer on desktop (lg+)
    if (!contentRef.current || window.innerWidth < 1024) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setContentVisible(true);
      },
      { threshold: 0.05, rootMargin: "0px 0px -50px 0px" }
    );
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col lg:flex-row relative overflow-x-hidden">
      {/* ─── MOBILE SPLINE: centered orb, scroll down to reveal login ─── */}
      <div className="h-screen lg:hidden relative shrink-0 bg-black touch-pan-y">
        {/* Mobile logo - top center over Spline */}
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
          <Logo className="w-10 h-10" />
          <div className="text-center">
            <span className="font-semibold text-xl text-white block">Ai Aethel</span>
            <p className="text-[10px] text-neutral-300">Accountant</p>
          </div>
        </div>
        <iframe
          src="https://my.spline.design/reactiveorb-YcWeUq9lGkjENkHnNB7hvUjG/"
          className="absolute top-1/2 left-1/2 h-[100%] w-[220%] md:max-lg:w-[240%] -translate-x-[72%] md:max-lg:-translate-x-[62%] -translate-y-1/2 border-0"
          allowFullScreen
          loading="eager"
          title="Spline background"
        />
        {/* Scroll hint */}
        <div className="absolute bottom-8 left-[35%] md:max-lg:left-[42%] -translate-x-1/2 flex flex-col items-center gap-2 z-10 animate-bounce">
          <span className="text-[10px] text-white/50 tracking-widest uppercase">Desliza hacia abajo</span>
          <svg className="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>

      {/* ─── DESKTOP SPLINE: left side panel 65% ─── */}
      <div className="hidden lg:block w-[65%] h-full relative overflow-hidden bg-black">
        <iframe
          src="https://my.spline.design/reactiveorb-YcWeUq9lGkjENkHnNB7hvUjG/"
          className="absolute inset-0 w-full h-full border-0 -translate-x-[22%]"
          allowFullScreen
          loading="eager"
          title="Spline background"
        />
      </div>

      {/* Desktop logo - top left corner over Spline */}
      <div className="hidden lg:flex absolute top-6 left-6 z-20 items-center gap-2">
        <Logo className="w-8 h-8" />
        <div>
          <span className="font-semibold text-lg text-white">Ai Aethel</span>
          <p className="text-[10px] text-neutral-300">Accountant</p>
        </div>
      </div>

      {/* ─── CONTENT: fades in + slides up smoothly when scrolled into view ─── */}
      <div
        ref={contentRef}
        className={`w-full lg:w-[35%] lg:h-full relative z-10 transition-all duration-700 ease-out ${
          contentVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-6"
        }`}
      >
        <Outlet />
      </div>
    </div>
  );
}
