import { useState, useEffect } from "react";
import { useLocation } from "react-router";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import { Logo } from "@/components/Logo";

export default function AuthLayout() {
  const location = useLocation();
  const isRegister = location.pathname === "/register";
  const [showContent, setShowContent] = useState(false);

  // Initial reveal: Spline first, then content after 3s
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex relative">
      {/* ─── MOBILE SPLINE: centered, full coverage ─── */}
      <div className="fixed inset-0 z-0 overflow-hidden lg:hidden">
        <iframe
          src="https://my.spline.design/reactiveorb-lRUKXnfBGHKP2Gb80l06Ma7T/"
          className="absolute top-1/2 left-1/2 h-full min-w-[100vw] -translate-x-1/2 -translate-y-1/2 border-0 animate-[authSplineIn_1.2s_ease-out_forwards]"
          allowFullScreen
          loading="eager"
          title="Spline background"
        />
      </div>

      {/* ─── DESKTOP SPLINE: aligned to left side ─── */}
      <div className="hidden lg:block fixed inset-0 z-0 overflow-hidden">
        <iframe
          src="https://my.spline.design/reactiveorb-lRUKXnfBGHKP2Gb80l06Ma7T/"
          className="absolute inset-0 w-full h-full border-0 animate-[authSplineIn_1.2s_ease-out_forwards] lg:-translate-x-[22%]"
          allowFullScreen
          loading="eager"
          title="Spline background"
        />
      </div>

      {/* Desktop logo - top left corner over Spline */}
      <div
        className={`hidden lg:flex absolute top-6 left-6 z-20 items-center gap-2 transition-opacity duration-700 ${
          showContent ? "opacity-100" : "opacity-0"
        }`}
      >
        <Logo className="w-8 h-8" />
        <div>
          <span className="font-semibold text-lg text-white">Ai Aethel</span>
          <p className="text-[10px] text-neutral-300">Accountant</p>
        </div>
      </div>

      {/* ─── CONTENT: smooth fade-in on route change ─── */}
      <div
        key={location.pathname}
        className={`w-full h-full transition-opacity duration-300 ${
          showContent ? "opacity-100 animate-[authReveal_0.5s_ease_forwards]" : "opacity-0"
        }`}
      >
        {isRegister ? <Register /> : <Login />}
      </div>
    </div>
  );
}
