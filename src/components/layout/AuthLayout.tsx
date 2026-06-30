import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import { Logo } from "@/components/Logo";

export default function AuthLayout() {
  const location = useLocation();
  const isRegister = location.pathname === "/register";

  const [showContent, setShowContent] = useState(false);
  const [contentVisible, setContentVisible] = useState(true);
  const [displayRegister, setDisplayRegister] = useState(isRegister);
  const prevPath = useRef(location.pathname);

  // Initial reveal: Spline first, then content after 3s
  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Smooth crossfade between login/register
  useEffect(() => {
    if (location.pathname === prevPath.current) return;

    setContentVisible(false);
    const timer = setTimeout(() => {
      prevPath.current = location.pathname;
      setDisplayRegister(isRegister);
      setContentVisible(true);
    }, 200);
    return () => clearTimeout(timer);
  }, [location.pathname, isRegister]);

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex relative">
      {/* ─── SPLINE BACKGROUND: full screen on all devices ─── */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <iframe
          src="https://my.spline.design/reactiveorb-lRUKXnfBGHKP2Gb80l06Ma7T/"
          className="absolute top-1/2 left-1/2 h-full min-w-[100vw] -translate-x-1/2 -translate-y-1/2 border-0 animate-[authSplineIn_1.2s_ease-out_forwards] lg:left-0 lg:top-0 lg:min-w-0 lg:w-full lg:-translate-x-[22%] lg:-translate-y-0"
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

      {/* ─── CONTENT: smooth crossfade on login/register switch ─── */}
      <div
        className={`w-full h-full transition-opacity duration-200 ${
          showContent && contentVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {displayRegister ? <Register /> : <Login />}
      </div>
    </div>
  );
}
