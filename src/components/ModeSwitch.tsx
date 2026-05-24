import { useMode } from "@/contexts/ModeContext";
import { useAuth } from "@/hooks/useAuth";
import { Building2, User } from "lucide-react";

export function ModeSwitch() {
  const { mode, toggleMode } = useMode();
  const { user } = useAuth();

  // Only show switch if user has personal mode enabled
  if (!user?.hasPersonalMode) return null;

  return (
    <button
      onClick={toggleMode}
      className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors"
      title={mode === "business" ? "Cambiar a Personal" : "Cambiar a Negocios"}
    >
      {mode === "business" ? (
        <>
          <Building2 className="w-3.5 h-3.5 text-neutral-600" />
          <span className="text-xs font-medium text-neutral-700">Negocios</span>
        </>
      ) : (
        <>
          <User className="w-3.5 h-3.5 text-neutral-600" />
          <span className="text-xs font-medium text-neutral-700">Personal</span>
        </>
      )}
      <div className="w-7 h-4 bg-neutral-200 rounded-full relative ml-1">
        <div className={`w-3 h-3 bg-black rounded-full absolute top-0.5 transition-all duration-200 ${mode === "personal" ? "left-3.5" : "left-0.5"}`} />
      </div>
    </button>
  );
}
