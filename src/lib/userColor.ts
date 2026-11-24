// The colors of the person's own circle (the initial in the menu), chosen in Ajustes › Perfil or with the assistant.
// Class names are written out whole so Tailwind keeps them.
import type { UserColor } from "@contracts/bubble";

export const USER_COLOR_CLASSES: Record<UserColor, { circle: string; swatch: string }> = {
  blue: { circle: "bg-blue-50 text-blue-700 ring-blue-100", swatch: "bg-blue-600" },
  violet: { circle: "bg-violet-50 text-violet-700 ring-violet-100", swatch: "bg-violet-600" },
  teal: { circle: "bg-teal-50 text-teal-700 ring-teal-100", swatch: "bg-teal-600" },
  green: { circle: "bg-emerald-50 text-emerald-700 ring-emerald-100", swatch: "bg-emerald-600" },
  amber: { circle: "bg-amber-50 text-amber-700 ring-amber-100", swatch: "bg-amber-500" },
  rose: { circle: "bg-rose-50 text-rose-700 ring-rose-100", swatch: "bg-rose-600" },
  slate: { circle: "bg-slate-100 text-slate-700 ring-slate-200", swatch: "bg-slate-700" },
};
