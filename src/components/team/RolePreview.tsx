import { Check, Eye, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { teamCopy } from "@/i18n/copy/team";
import { appCopy } from "@/i18n/copy/app";
import { ROLE_HOME, roleMenu, type TeamRole } from "./roles";
import { PATH_ICON, firstOf, initialsOf } from "./ui";

/**
 * The app as a role sees it: the menu with only that role's sections (the same rules the app uses
 * for real members), and their home with what they can and can't do. A picture, not a session.
 */
export function RolePreview({ role, name, companyName, logo }: { role: TeamRole; name: string | null; companyName: string | null; logo: string | null }) {
  const tt = useCopy(teamCopy);
  const app = useCopy(appCopy);
  const roleName = tt.roles[role].name;
  const company = companyName || tt.preview.yourBusiness;
  const menu = roleMenu(role);
  const home = ROLE_HOME[role];
  const tiles = menu.flatMap((g) => g.paths).filter((p) => p !== "/");
  const label = (p: string) => app.shell.labels[p] ?? p;
  return (
    <div inert className="grid select-none overflow-hidden rounded-xl bg-white shadow-[0_10px_28px_-16px_rgba(15,23,42,0.45)] ring-1 ring-slate-200 md:grid-cols-[190px_minmax(0,1fr)]">
      {/* The menu */}
      <aside className="border-b border-slate-200 bg-white p-3 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-1 pb-3">
          {logo
            ? <img src={logo} alt="" className="h-[30px] w-[30px] shrink-0 rounded-lg object-contain ring-1 ring-slate-200" />
            : <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-slate-900 text-[11px] font-extrabold text-white">{initialsOf(company) || "·"}</span>}
          <div className="min-w-0">
            <b className="block truncate text-[13px] font-bold text-slate-900">{company}</b>
            <span className="block truncate text-[11px] text-slate-500">{roleName}{name ? ` · ${name}` : ""}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 md:block md:space-y-0.5">
          {menu.map((g) => (
            <div key={g.group || "top"} className="contents md:block">
              {g.group && <p className="hidden px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 md:block">{app.shell.groups[g.group]}</p>}
              {g.paths.map((p) => {
                const Icon = PATH_ICON[p];
                const on = p === home;
                return (
                  <span key={p} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px]", on ? "bg-slate-900 font-semibold text-white" : "font-medium text-slate-500")}>
                    {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}<span className="truncate">{label(p)}</span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </aside>
      {/* Their home */}
      <div className="min-w-0 bg-slate-50 p-4">
        <div className="mb-4 flex items-center gap-2.5 rounded-[14px] border border-blue-600/25 bg-blue-50 px-3.5 py-2.5">
          <Eye className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
          <div className="min-w-0">
            <b className="block text-[13px] font-semibold text-slate-900">{name ? tt.viewAs.title(name, roleName) : tt.viewAs.titleRole(roleName)}</b>
            <span className="block text-xs text-slate-500">{role === "accountant" ? tt.viewAs.subAccountant : tt.viewAs.subStaff}</span>
          </div>
        </div>
        <h3 className="text-[19px] font-[750] text-slate-900">{tt.preview.hello(firstOf(name))}</h3>
        <p className="text-[13px] text-slate-500">{tt.preview.sub(company, roleName)}</p>
        <div className="mt-3 rounded-[14px] border border-slate-200 bg-white p-3.5">
          <h4 className="text-sm font-bold text-slate-900">{tt.preview.canTitle}</h4>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {tiles.slice(0, 6).map((p) => {
              const Icon = PATH_ICON[p];
              return (
                <span key={p} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  {Icon && <Icon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />}
                  <span className="min-w-0">
                    <b className="block text-sm font-semibold text-slate-900">{label(p)}</b>
                    {app.shell.desc[p] && <small className="block truncate text-xs text-slate-500">{app.shell.desc[p]}</small>}
                  </span>
                </span>
              );
            })}
          </div>
          <ul className="mt-3 grid gap-1 text-[13px]">
            {tt.roleCan[role].can.map((x) => <li key={x} className="flex items-start gap-2 text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{x}</li>)}
            {tt.roleCan[role].cannot.map((x) => <li key={x} className="flex items-start gap-2 text-slate-500"><Minus className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />{x}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
