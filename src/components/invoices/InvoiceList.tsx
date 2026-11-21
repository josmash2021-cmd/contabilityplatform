import { Bell, ClipboardList, FileText, Plus, Repeat } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { invoicesCopy } from "@/i18n/copy/invoices";
import { INVOICE_FILTERS, matchesFilter, type InvoiceFilter, type ReminderKind } from "../../../api/lib/invoices";
import { Dst, Kpi, LockedButton, PageHead, SegTabs } from "./proto";
import { CARD, LINK_BTN, btn } from "./ui";
import { dueView, invoiceNumber, money, monthName, seenText, stateView, type InvoiceItem, type InvoiceList } from "./shared";

const REMINDER_KINDS: ReminderKind[] = ["before", "onDue", "after", "weekly"];

/**
 * The prototype's `.srow.inv` grid: number, client, due, amount, status, action. Phones and tablets:
 * two columns (cards). With the sidebar (lg) the number column waits for room (xl).
 */
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_130px_110px_160px_100px] xl:grid-cols-[140px_minmax(0,1fr)_140px_120px_170px_100px]";

export function InvoiceListView({ data, loading, locale, filter, onFilter, canChange, ownerTools = true, canQuotes, busyRef, onNew, onOpen, onRemind, onIssue, onReminders, onQuotes, onRecurring, onLogo, onLocked }: {
  data: InvoiceList | undefined;
  loading: boolean;
  locale: string;
  filter: InvoiceFilter;
  onFilter: (f: InvoiceFilter) => void;
  canChange: boolean;
  /** The owner's tools: reminder settings, quotes, recurring, logo. Hidden for team members. */
  ownerTools?: boolean;
  canQuotes: boolean;
  /** The invoice whose row action is running. */
  busyRef: string | null;
  onNew: () => void;
  onOpen: (ref: string) => void;
  onRemind: (ref: string) => void;
  onIssue: (ref: string) => void;
  onReminders: () => void;
  onQuotes: () => void;
  onRecurring: () => void;
  onLogo: () => void;
  onLocked: () => void;
}) {
  const t = useCopy(invoicesCopy);
  const s = data?.summary;
  const today = data?.today ?? "";
  const items = data?.items ?? [];
  const shown = items.filter((i) => matchesFilter(i.state, filter));
  const remBits = data ? REMINDER_KINDS.filter((k) => data.reminders[k]).map((k) => t.reminders.bits[k]) : [];

  const sub = s ? (
    <>
      {t.owedSub("")}<b className="font-semibold tabular-nums text-slate-900">{money(s.owedCents)}</b>
      {s.lateCount > 0 && ` · ${t.lateSub(s.lateCount)}`}
    </>
  ) : <Skeleton className="inline-block h-4 w-40 align-middle" />;

  return (
    <>
      <PageHead
        title={t.title}
        sub={sub}
        right={canChange && (
          <button type="button" className={btn("primary", "w-full sm:w-auto")} onClick={onNew}>
            <Plus className="h-4 w-4" aria-hidden="true" />{t.newInvoice}
          </button>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {s ? (
          <>
            <Kpi label={t.kpi.open} value={money(s.openCents)} sub={t.kpi.openSub(s.openCount)} />
            <Kpi label={t.kpi.late} value={money(s.lateCents)} sub={s.lateCount > 0 ? t.kpi.lateSub(s.lateCount) : t.kpi.nothingLate} tone={s.lateCount > 0 ? "bad" : "good"} />
            <Kpi label={t.kpi.collected(monthName(s.monthStart, locale))} value={money(s.collectedMonthCents)} sub={t.kpi.collectedSub} tone="good" />
          </>
        ) : (
          [0, 1, 2].map((k) => <Skeleton key={k} className="h-[98px] rounded-[14px]" />)
        )}
      </div>

      {/* .rem-strip — the app prepares reminders; the user sends them (no email service). */}
      <div className="mb-2.5 mt-3.5 flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
        <Bell className="h-4 w-4 flex-none text-blue-600" aria-hidden="true" />
        <span className="min-w-0 flex-[1_1_220px]">
          <b className="font-[650] text-slate-900">{t.reminders.strip}</b>{" "}
          {data ? (remBits.length > 0 ? remBits.join(" · ") : t.reminders.off) : "…"}
          {remBits.length > 0 && <> — {t.reminders.howShort}.</>}
          {s && s.remindersToSend > 0 && <b className="ml-1 font-semibold text-amber-700">{t.reminders.toSend(s.remindersToSend)}</b>}
        </span>
        {ownerTools && <button type="button" className={LINK_BTN} onClick={onReminders}>{t.reminders.change}</button>}
      </div>

      {ownerTools && <div className="mb-3 flex flex-wrap gap-1.5">
        {canQuotes ? (
          <>
            <button type="button" className={btn("sm")} onClick={onQuotes}><ClipboardList className="h-[15px] w-[15px]" aria-hidden="true" />{t.tools.quotes}</button>
            <button type="button" className={btn("sm")} onClick={onRecurring}><Repeat className="h-[15px] w-[15px]" aria-hidden="true" />{t.tools.recurring}</button>
          </>
        ) : (
          <>
            <LockedButton label={t.tools.quotes} title={t.tools.lockedTitle} onClick={onLocked} />
            <LockedButton label={t.tools.recurring} title={t.tools.lockedTitle} onClick={onLocked} />
          </>
        )}
        <button type="button" className={btn("sm")} onClick={onLogo}><FileText className="h-[15px] w-[15px]" aria-hidden="true" />{t.tools.logo}</button>
      </div>}

      <SegTabs
        label={t.tabs.label}
        value={filter}
        onChange={onFilter}
        items={INVOICE_FILTERS.map((f) => ({ value: f, label: t.tabs[f], count: data ? data.counts[f] : null }))}
      />

      <div className="mt-3 overflow-hidden rounded-[14px] border border-slate-200 bg-white">
        <div className={cn(ROW, "hidden bg-slate-100 py-[9px] text-xs font-semibold text-slate-500 lg:grid")} aria-hidden="true">
          <span className="hidden xl:block">{t.cols.number}</span><span>{t.cols.client}</span><span>{t.cols.due}</span><span className="text-right">{t.cols.amount}</span><span>{t.cols.status}</span><span />
        </div>
        {loading ? (
          <div className="grid gap-px" role="status" aria-label={t.loading}>
            {[0, 1, 2, 3].map((k) => <div key={k} className="border-t border-slate-200 px-4 py-3 first:border-t-0 lg:first:border-t"><Skeleton className="h-9 w-full" /></div>)}
          </div>
        ) : items.length === 0 ? (
          <div className="border-t-0 px-5 py-10 text-center lg:border-t lg:border-slate-200">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-600" aria-hidden="true"><FileText className="h-6 w-6" /></span>
            <h2 className="mt-3 font-semibold text-slate-900">{t.emptyTitle}</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{t.emptyText}</p>
            {canChange && <button type="button" className={btn("primary", "mt-4")} onClick={onNew}><Plus className="h-4 w-4" aria-hidden="true" />{t.newInvoice}</button>}
          </div>
        ) : shown.length === 0 ? (
          <div className={cn(ROW, "border-t border-slate-200 lg:grid-cols-1")}><span className="text-slate-500">{t.emptyFiltered}</span></div>
        ) : (
          <ul>
            {shown.map((i) => (
              <Row
                key={i.ref} i={i} today={today} locale={locale} canChange={canChange} busy={busyRef === i.ref}
                onOpen={onOpen} onRemind={onRemind} onIssue={onIssue}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Row({ i, today, locale, canChange, busy, onOpen, onRemind, onIssue }: {
  i: InvoiceItem; today: string; locale: string; canChange: boolean; busy: boolean;
  onOpen: (ref: string) => void; onRemind: (ref: string) => void; onIssue: (ref: string) => void;
}) {
  const t = useCopy(invoicesCopy);
  const st = stateView(i, t);
  const due = dueView(i, today, t, locale);
  const client = i.customerName || t.noClient;
  const num = invoiceNumber(i, t);
  const partial = i.netPaidCents > 0 && i.balanceCents > 0;
  // Prototype: "Recordar" on overdue ones; here also when a reminder date has come up.
  const action = !canChange ? null
    : i.state === "draft" ? (
      <button type="button" className={btn("sm", "primary")} disabled={busy} onClick={(e) => { e.stopPropagation(); onIssue(i.ref); }}>{t.sendShort}</button>
    ) : i.state === "late" || i.reminderDue ? (
      <button type="button" className={btn("sm")} onClick={(e) => { e.stopPropagation(); onRemind(i.ref); }}>{t.remind}</button>
    ) : null;

  return (
    <li
      className={cn(ROW, "cursor-pointer border-t border-slate-200 transition-colors first:border-t-0 hover:bg-slate-100 lg:first:border-t")}
      onClick={() => onOpen(i.ref)}
    >
      <span className="hidden truncate text-[13px] tabular-nums text-slate-500 xl:block">{num}</span>
      <div className="col-start-1 row-start-1 min-w-0 lg:col-start-auto lg:row-start-auto">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpen(i.ref); }}
          aria-label={t.openAria(num, client)}
          className="block max-w-full truncate rounded text-left font-[650] text-slate-900 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {client}
        </button>
        <span className="block truncate text-xs text-slate-500">{seenText(i, today, t, locale)}</span>
      </div>
      <span className={cn("col-start-1 row-start-2 text-xs lg:col-start-auto lg:row-start-auto lg:text-[13px]", due.tone === "bad" ? "text-red-600" : due.tone === "warn" ? "text-amber-700" : "text-slate-900")}>
        {due.text}
      </span>
      <span className="col-start-2 row-start-1 grid justify-items-end text-right lg:col-start-auto lg:row-start-auto">
        <b className="font-bold tabular-nums text-slate-900">{money(i.totalCents)}</b>
        {partial && <span className="text-xs font-medium text-slate-500">{t.left(money(i.balanceCents))}</span>}
      </span>
      <span className="col-start-2 row-start-2 justify-self-end lg:col-start-auto lg:row-start-auto lg:justify-self-start"><Dst label={st.label} tone={st.tone} /></span>
      <span className={cn("col-span-2 flex justify-start gap-1.5 lg:col-span-1 lg:justify-end", !action && "hidden lg:flex")}>{action}</span>
    </li>
  );
}

/** The bordered empty card used when the page is locked. */
export function LockedCard({ title, text, cta, onCta }: { title: string; text: string; cta?: string; onCta?: () => void }) {
  return (
    <section className={cn(CARD, "grid justify-items-start gap-1.5 border-dashed bg-slate-100 p-[18px]")}>
      <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
      <p className="mb-1 text-[13px] text-slate-500">{text}</p>
      {cta && onCta && <button type="button" className={btn("sm")} onClick={onCta}>{cta}</button>}
    </section>
  );
}
