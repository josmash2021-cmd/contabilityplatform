import { Outlet } from "react-router";

export default function AuthLayout() {
  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex w-[55%] bg-black items-end justify-center pb-12">
        <span className="text-white text-2xl">SPLINE LEFT</span>
      </div>
      <div className="w-full lg:w-[45%] bg-blue-600">
        <Outlet />
      </div>
    </div>
  );
}
