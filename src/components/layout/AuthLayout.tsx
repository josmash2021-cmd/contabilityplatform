import { useState, useEffect, useRef } from "react";
import { Outlet } from "react-router";
import { Logo } from "@/components/Logo";

export default function AuthLayout() {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setContentVisible(true);
      },
      { threshold: 0.15 }
    );
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col lg:flex-row relative">
      {/* ─── MOBILE SPLINE: full viewport height, then scroll to content ─── */}
      <div className="h-screen lg:hidden relative overflow-hidden shrink-0">
        <iframe
          src="https://my.spline.design/reactiveorb-YcWeUq9lGkjENkHnNB7hvUjG/"
          className="absolute top-1/2 left-1/2 h-full min-w-[100vw] -translate-x-1/2 -translate-y-1/2 border-0"
          allowFullScreen
          loading="eager"
          title="Spline background"
        />
      </div>

      {/* ─── DESKTOP SPLINE: left side panel ─── */}
      <div className="hidden lg:block w-[60%] h-full relative overflow-hidden bg-black">
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

      {/* ─── CONTENT: scroll into view on mobile, fades in ─── */}
      <div
        ref={contentRef}
        className={`w-full lg:w-[40%] lg:h-full relative z-10 transition-opacity duration-700 ${
          contentVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <Outlet />
      </div>
    </div>
  );
}
