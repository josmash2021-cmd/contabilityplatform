import { Outlet } from "react-router";
import { Logo } from "@/components/Logo";

export default function AuthLayout() {
  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex relative">
      {/* ─── SPLINE BACKGROUND: full screen ─── */}
      <div className="fixed inset-0 z-0">
        <iframe
          src="https://my.spline.design/reactiveorb-lRUKXnfBGHKP2Gb80l06Ma7T/"
          className="absolute inset-0 w-full h-full border-0 lg:-translate-x-[22%]"
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

      {/* ─── CONTENT OUTLET ─── */}
      <Outlet />
    </div>
  );
}
