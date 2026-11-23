// The admin's list of people: a table on computers (person, type, plan, status, last seen, Ver) and, on phones,
// a list (name, type · plan, the status chip) where tapping a person opens their card.
import { ChevronRight } from "lucide-react";
import type { AdminCopy } from "@/i18n/copy/admin";
import type { Lang } from "@/i18n/lang";
import { Avatar, StatusChip } from "./adminUi";
import { planLabel, timeAgo, type AdminOut } from "./adminFormat";

type Row = AdminOut["listUsers"]["users"][number];

export function AdminUserList({ users, onOpen, t, lang }: { users: Row[]; onOpen: (id: number) => void; t: AdminCopy; lang: Lang }) {
  const mode = (u: Row) => (u.modePreference === "personal" ? "personal" : "business");
  return (
    <>
      {/* Phones */}
      <ul className="grid sm:hidden">
        {users.map((u) => (
          <li key={u.id}>
            <button type="button" onClick={() => onOpen(u.id)} className="flex w-full items-center gap-3 border-b border-slate-100 py-3 text-left last:border-0 active:bg-slate-50">
              <Avatar name={u.name} email={u.email} className="h-10 w-10" />
              <span className="grid min-w-0 flex-1">
                <b className="truncate text-[15px]">{u.name || u.email}</b>
                <span className="truncate text-xs text-slate-500">{t.kind[mode(u)]} · {planLabel(u.status, mode(u), t, lang)}</span>
              </span>
              <StatusChip status={u.status} t={t} className="shrink-0" />
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>

      {/* Computers */}
      <div className="relative hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2.5 font-semibold">{t.cols.person}</th>
              <th className="px-3 py-2.5 font-semibold">{t.cols.kind}</th>
              <th className="px-3 py-2.5 font-semibold">{t.cols.plan}</th>
              <th className="px-3 py-2.5 font-semibold">{t.cols.status}</th>
              <th className="px-3 py-2.5 font-semibold">{t.cols.seen}</th>
              <th className="w-16 px-3 py-2.5"><span className="sr-only">{t.home.see}</span></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={u.name} email={u.email} />
                    <span className="grid min-w-0"><b className="truncate">{u.name || u.email}</b><span className="truncate text-xs text-slate-500">{u.email}</span></span>
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-700">{t.kind[mode(u)]}</td>
                <td className="px-3 py-3 text-slate-700">{planLabel(u.status, mode(u), t, lang)}</td>
                <td className="px-3 py-3"><StatusChip status={u.status} t={t} /></td>
                <td className="px-3 py-3 text-[13px] text-slate-500">{timeAgo(u.lastSignInAt, lang, t)}</td>
                <td className="px-3 py-3"><button type="button" onClick={() => onOpen(u.id)} className="h-9 w-full rounded-[10px] border border-slate-200 text-[13px] font-semibold hover:bg-slate-50">{t.home.see}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
