import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Eye } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { teamCopy } from "@/i18n/copy/team";
import { registerViewAsBanner, stopViewAs, useViewAs } from "./viewAs";

/** The bar at the top while the owner previews the app as a role: whose view it is, and the way back. Renders nothing otherwise. */
export function ViewAsBanner() {
  const v = useViewAs();
  const tt = useCopy(teamCopy);
  const t = tt.viewAs;
  const navigate = useNavigate();
  useEffect(() => registerViewAsBanner(), []);
  if (!v) return null;
  const role = tt.roles[v.role].name;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-blue-600/25 bg-blue-50 px-4 py-2.5" role="status">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-blue-600 ring-1 ring-blue-600/25"><Eye className="h-4 w-4" aria-hidden /></span>
      <div className="min-w-0 flex-[1_1_220px]">
        <b className="block text-sm font-semibold text-slate-900">{v.name ? t.title(v.name, role) : t.titleRole(role)}</b>
        <span className="block text-xs text-slate-500">{v.role === "accountant" ? t.subAccountant : t.subStaff}</span>
      </div>
      <button type="button" onClick={() => { stopViewAs(); navigate("/team"); }}
        className="inline-flex min-h-[34px] items-center rounded-[10px] border border-slate-200 bg-white px-[11px] text-[13px] font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        {t.exit}
      </button>
    </div>
  );
}
