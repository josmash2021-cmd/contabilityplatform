import { useEffect, useId, useMemo, useState } from "react";
import { Bell, FileText, Inbox, Loader2, PieChart, Search, Truck, Users, Tag, Target, ArrowLeftRight, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import type { AppCopy } from "@/i18n/copy/app";
import { personalCopy } from "@/i18n/copy/personal";
import { budgetCategoryLabel } from "@/i18n/copy/budgets";

const money = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Section = { path: string; icon: LucideIcon };
type Row = { key: string; icon: LucideIcon; title: string; detail: string; value: string; path: string };

const KIND_ICON: Record<string, LucideIcon> = {
  customer: Users, invoice: FileText, service: Tag, review: Inbox, vendor: Truck, movement: ArrowLeftRight, goal: Target,
};

/** The prototype's search: your clients, invoices, products and movements — plus the app's sections. */
export function GlobalSearch({ sections, label, t, onGo, personal, compact }: {
  sections: Section[]; label: (p: string) => string; t: AppCopy; onGo: (p: string) => void; personal: boolean; compact?: boolean;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(id);
  }, [q]);

  const enabled = debounced.length >= 2;
  const { data, isFetching } = trpc.search.global.useQuery({ q: debounced }, { enabled, staleTime: 30_000 });

  const rows: Row[] = useMemo(() => {
    const term = norm(q.trim());
    if (!term) return [];
    const sec: Row[] = sections
      .filter((s) => norm(`${label(s.path)} ${t.shell.desc[s.path] ?? ""}`).includes(term))
      .slice(0, 3)
      .map((s) => ({ key: `s:${s.path}`, icon: s.icon, title: label(s.path), detail: t.shell.find.sections, value: "", path: s.path }));
    const hits: Row[] = (enabled ? data?.hits ?? [] : []).map((h) => {
      const kind = t.shell.find.kinds[h.kind] ?? h.kind;
      let value = h.amount !== null ? money(h.amount) : "";
      if (h.kind === "customer") value = h.amount ? t.shell.find.owes(money(h.amount)) : t.shell.find.upToDate;
      if (h.kind === "vendor") value = h.amount ? t.shell.find.youOwe(money(h.amount)) : "";
      if ((h.kind === "review" || h.kind === "movement") && h.amount !== null) value = `${h.meta.type === "income" ? "+" : "−"}${money(h.amount)}`;
      return { key: `${h.kind}:${h.id}`, icon: KIND_ICON[h.kind] ?? Search, title: h.title, detail: kind, value, path: h.path };
    });
    return [...hits, ...sec].slice(0, 12);
  }, [q, sections, label, t, data, enabled]);

  const go = (p: string) => { setQ(""); setOpen(false); onGo(p); };
  const show = open && q.trim().length > 0;
  return (
    <div className={cn("relative min-w-0 flex-1", compact ? "" : "max-w-xl")}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        type="search" value={q} placeholder={personal ? t.shell.find.personal : t.shell.find.business} aria-label={t.shell.searchLabel}
        role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={show && rows[active] ? `${listId}-${active}` : undefined}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(rows.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && rows[active]) go(rows[active].path);
          else if (e.key === "Escape") { setQ(""); setOpen(false); }
        }}
        className="h-10 w-full rounded-[10px] border border-slate-200 bg-slate-100 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-blue-50"
      />
      {show && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.35)]">
          {rows.length === 0 && (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-500">
              {enabled && isFetching ? <><Loader2 className="h-4 w-4 animate-spin" />{t.shell.find.searching}</> : t.shell.noResults}
            </li>
          )}
          {rows.map((r, i) => {
            const Icon = r.icon;
            return (
              <li key={r.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.path)} onMouseEnter={() => setActive(i)}
                  className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm", i === active ? "bg-slate-100" : "")}>
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="truncate text-slate-900">{r.title}<span className="text-slate-500"> · {r.detail}</span></span>
                  </span>
                  {r.value && <span className="shrink-0 text-[13px] tabular-nums text-slate-500">{r.value}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type Notice = { key: string; kind: string; params: Record<string, string | number>; date: string; urgent: boolean; path: string; read: boolean };

const NOTICE_ICON: Record<string, LucideIcon> = {
  review: Inbox, bill_late: Bell, bill_soon: Bell, owed: Users, budget_near: PieChart, budget_over: PieChart, tax_redo: FileText,
};

/** The prototype's bell: real notices from your data; "read" is remembered on every device. */
export function NoticesBell({ t, onGo }: { t: AppCopy; onGo: (p: string) => void }) {
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const { categories } = useCopy(personalCopy);
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const { data } = trpc.notices.list.useQuery(undefined, { staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const markRead = trpc.notices.markRead.useMutation({ onSuccess: () => void utils.notices.list.invalidate() });
  const markAll = trpc.notices.markAllRead.useMutation({ onSuccess: () => void utils.notices.list.invalidate() });
  const items = (data?.items ?? []) as Notice[];
  const unread = data?.unread ?? 0;

  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(locale, { day: "numeric", month: "short" });
  const words = (n: Notice): [string, string] => {
    const p = n.params;
    const amt = (k: string) => money(Number(p[k] ?? 0));
    switch (n.kind) {
      case "review": return t.shell.bell.review(Number(p.count ?? 0));
      case "bill_late": return t.shell.bell.billLate(String(p.vendor ?? ""), amt("amount"), day(String(p.due)));
      case "bill_soon": return t.shell.bell.billSoon(String(p.vendor ?? ""), amt("amount"), day(String(p.due)));
      case "owed": return t.shell.bell.owed(String(p.client ?? ""), amt("amount"), day(String(p.since)));
      case "budget_near": return t.shell.bell.budgetNear(budgetCategoryLabel(String(p.category), categories.expense), Number(p.percent ?? 0), amt("spent"), amt("limit"));
      case "budget_over": return t.shell.bell.budgetOver(budgetCategoryLabel(String(p.category), categories.expense), amt("spent"), amt("limit"));
      default: return t.shell.bell.taxRedo;
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button aria-label={t.shell.bell.open(unread)}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Bell className="h-5 w-5" aria-hidden />
          {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-white">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(380px,calc(100vw-24px))] rounded-[14px] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[15px] font-bold text-slate-900">{t.shell.bell.title}</p>
            <p className="text-xs text-slate-500">{unread ? t.shell.bell.unread(unread) : t.shell.bell.allRead}</p>
          </div>
          {unread > 0 && (
            <button onClick={() => markAll.mutate()} disabled={markAll.isPending} className="rounded-lg px-2 py-1 text-[13px] font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-50">
              {t.shell.bell.markAll}
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">{t.shell.bell.empty}</p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto p-1.5">
            {items.map((n) => {
              const Icon = NOTICE_ICON[n.kind] ?? Bell;
              const [title, body] = words(n);
              return (
                <li key={n.key}>
                  <button
                    onClick={() => { if (!n.read) markRead.mutate({ keys: [n.key] }); setOpen(false); if (n.path) onGo(n.path); }}
                    className={cn("grid w-full grid-cols-[32px_minmax(0,1fr)_10px] items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left hover:bg-slate-50", !n.read && "bg-blue-50/40")}
                  >
                    <span className={cn("grid h-8 w-8 place-items-center rounded-full", n.urgent ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-600")}><Icon className="h-4 w-4" aria-hidden /></span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{title}</span>
                      <span className="block text-[13px] text-slate-600">{body}</span>
                      <span className="block text-xs text-slate-400">{day(n.date)}{n.urgent ? ` · ${t.shell.bell.urgent}` : ""}</span>
                    </span>
                    {!n.read ? <i className="mt-1.5 h-2 w-2 rounded-full bg-blue-600" aria-hidden /> : <span />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">{t.shell.bell.note}</p>
      </PopoverContent>
    </Popover>
  );
}
