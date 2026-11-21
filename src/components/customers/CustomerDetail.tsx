import { Link } from "react-router";
import { AlertCircle, ArrowLeft, FileText, Lock, Mail, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { clientesCopy, type ClientesCopy } from "@/i18n/copy/clientes";
import { daysBetween } from "../../../api/lib/ventas";
import { Kpi, Note, PageHead, PopMenu, type MenuItem } from "@/components/pos/proto";
import { CARD, CARD_TITLE, FOCUS, btn } from "@/components/pos/ui";
import { DEVICE_TZ, money0C, moneyC, shortDay } from "@/components/pos/posTypes";
import { firstName, fullName, messageLink, type Customer } from "./customerUtils";

type Role = "owner" | "staff" | "accountant";

type Props = {
  id: number;
  role: Role | null;
  /** Plan features (subscription.planInfo). */
  features: readonly string[];
  company: string;
  locale: string;
  onBack: () => void;
  onEdit: (c: Customer) => void;
  onDelete: (c: Customer) => void;
};

type TimelineEvent = { id: string; at: Date | string; day: string; kind: string; tone: "good" | "bad" | "info"; number?: string; cents?: number; method?: string };

/** The prototype's client card (`customerDetail`): actions, three numbers, history, details, unpaid invoices, what they buy. */
export function CustomerDetail({ id, role, features, company, locale, onBack, onEdit, onDelete }: Props) {
  const t = useCopy(clientesCopy);
  const d = t.detail;
  const q = trpc.customers.detail.useQuery({ id, timeZone: DEVICE_TZ }, { retry: (n, e) => e.data?.code !== "NOT_FOUND" && n < 2 });

  const back = (
    <button type="button" onClick={onBack} className={`mb-2 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-slate-500 hover:text-slate-900 sm:min-h-0 sm:py-1 ${FOCUS}`}>
      <ArrowLeft className="h-4 w-4" aria-hidden />{d.back}
    </button>
  );

  if (q.isLoading) {
    return (
      <div aria-busy="true">
        {back}
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="mt-2 h-4 w-40 rounded" />
        <div className="mt-5 grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-[92px] rounded-[14px]" />)}</div>
        <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"><Skeleton className="h-64 rounded-[14px]" /><Skeleton className="h-64 rounded-[14px]" /></div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    const gone = q.error?.data?.code === "NOT_FOUND";
    return (
      <div>
        {back}
        <section className="flex flex-col items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-5 py-10 text-center">
          <AlertCircle className={cn("h-6 w-6", gone ? "text-slate-400" : "text-red-600")} aria-hidden />
          <p className="text-sm text-slate-700">{gone ? d.notFound : d.loadError}</p>
          {!gone && <button type="button" onClick={() => void q.refetch()} className={btn()}>{t.retry}</button>}
        </section>
      </div>
    );
  }

  const { customer, kpis, open, bought, timeline, today } = q.data;
  const c: Customer = { ...customer, createdAt: customer.createdAt };
  const name = fullName(c);
  const first = firstName(c);
  const owner = role === "owner";
  const canCharge = role === "owner" || role === "staff";
  const canEdit = role === "owner" || role === "staff";
  const due = (day: string) => {
    const n = daysBetween(today, day);
    return n < 0 ? d.due.late(-n) : n === 0 ? d.due.today : d.due.in(n);
  };

  // Estado de cuenta: what's open, sent from the user's own WhatsApp or email.
  const statement = [
    t.msg.statementHead(first, company),
    ...(open.length === 0 ? [t.msg.statementNone] : [
      ...open.map((o) => t.msg.statementLine(o.number, moneyC(o.balanceCents), shortDay(o.dueDay, locale, today))),
      t.msg.statementTotal(moneyC(kpis.owedCents)),
    ]),
  ].join("\n");
  const statementLink = messageLink(c, statement, t.msg.statementSubject(company));

  const menu: MenuItem[] = [
    ...(canCharge && statementLink ? [{ key: "statement", label: d.statement, icon: Mail, onSelect: () => window.open(statementLink, "_blank", "noopener") }] : []),
    ...(canEdit ? [{ key: "edit", label: d.edit, icon: Pencil, onSelect: () => onEdit(c) }] : []),
    "sep",
    ...(owner ? [{ key: "delete", label: d.delete, icon: Trash2, onSelect: () => onDelete(c), danger: true }] : []),
  ];
  const hasQuotes = features.includes("quotes");
  const since = new Date(customer.createdAt).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const slow = kpis.payDays !== null && kpis.lastTermsDays !== null && kpis.payDays > kpis.lastTermsDays + 3;

  return (
    <div>
      {back}
      <PageHead
        title={name}
        sub={d.since(since)}
        right={
          <div className="flex flex-wrap gap-1.5">
            {owner && <Link to={`/invoices?new=1&customer=${customer.id}`} className={btn("primary")}>{d.newInvoice}</Link>}
            {owner && (hasQuotes
              ? <Link to={`/quotes?new=1&customer=${customer.id}`} className={btn()}>{d.newQuote}</Link>
              : <Link to="/settings?sec=plan" className={btn("locked")} title={d.quoteLocked}><Lock className="h-3.5 w-3.5" aria-hidden />{d.newQuote}</Link>)}
            {canCharge && <Link to={`/pos?customer=${customer.id}`} className={btn()}><ShoppingCart className="h-4 w-4" aria-hidden />{d.charge}</Link>}
            <PopMenu label={d.more} items={menu} />
          </div>
        }
      />

      {/* `.three` */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label={d.kpi.billed} value={money0C(kpis.billedYearCents)} sub={d.kpi.sales(kpis.salesYear)} />
        <Kpi
          label={d.kpi.owes} value={kpis.owedCents > 0 ? moneyC(kpis.owedCents) : "$0"}
          sub={kpis.owedCents > 0 ? (kpis.hasLate ? d.kpi.hasLate : d.kpi.onTime) : d.kpi.upToDate}
          tone={kpis.owedCents > 0 ? (kpis.hasLate ? "bad" : undefined) : "good"}
        />
        <Kpi
          label={d.kpi.payDays} value={kpis.payDays !== null ? d.kpi.days(kpis.payDays) : "—"}
          sub={kpis.payDays === null ? d.kpi.noPays : kpis.lastTermsDays !== null ? d.kpi.terms(kpis.lastTermsDays) : ""}
          tone={kpis.payDays === null ? undefined : slow ? "bad" : "good"}
        />
      </div>

      {slow && kpis.payDays !== null && kpis.lastTermsDays !== null && (
        <Note className="mt-3">{d.slowTip(first, d.kpi.days(kpis.payDays - kpis.lastTermsDays))}</Note>
      )}

      {/* `.cols` */}
      <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className={CARD} aria-labelledby="cust-hist">
          <h2 id="cust-hist" className={CARD_TITLE}>{d.history}</h2>
          {timeline.length <= 1 && kpis.salesYear === 0 && open.length === 0 && bought.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{d.noHistory}</p>
          ) : (
            <ul className="mt-3">
              {(timeline as TimelineEvent[]).map((e, i, all) => (
                <li key={e.id} className="relative grid grid-cols-[50px_minmax(0,1fr)] gap-2.5 pb-3.5 text-[13px] last:pb-0">
                  <span className="text-xs text-slate-500">{shortDay(e.day, locale, today)}</span>
                  <span className={cn("absolute left-[60px] top-[5px] h-2 w-2 rounded-full", e.tone === "good" ? "bg-emerald-600" : e.tone === "bad" ? "bg-red-600" : "bg-blue-600")} aria-hidden />
                  {i < all.length - 1 && <span className="absolute bottom-0 left-[63.5px] top-[15px] w-px bg-slate-200" aria-hidden />}
                  <span className="pl-[18px] text-slate-900">{eventText(e, t)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-3">
          <section className={CARD} aria-labelledby="cust-data">
            <h2 id="cust-data" className={CARD_TITLE}>{d.data}</h2>
            <dl className="mt-2.5 grid gap-2.5 text-sm">
              <div className="grid gap-px"><dt className="text-xs text-slate-500">{d.phone}</dt><dd className="text-slate-900">{customer.phone || d.missing}</dd></div>
              <div className="grid gap-px"><dt className="text-xs text-slate-500">{d.email}</dt><dd className="break-all text-slate-900">{customer.email || d.missing}</dd></div>
              <div className="grid gap-px"><dt className="text-xs text-slate-500">{d.address}</dt><dd className="text-slate-900">{customer.address || d.missing}</dd></div>
              {customer.notes && <div className="grid gap-px"><dt className="text-xs text-slate-500">{d.notes}</dt><dd className="text-slate-900">{customer.notes}</dd></div>}
            </dl>
          </section>

          {open.length > 0 && (
            <section className={CARD} aria-labelledby="cust-open">
              <h2 id="cust-open" className={CARD_TITLE}>{d.unpaid}</h2>
              <ul className="mt-2.5 grid gap-2">
                {open.map((o) => (
                  <li key={o.saleId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-slate-100 px-3 py-[11px]">
                    <FileText className={cn("h-5 w-5", o.late ? "text-red-600" : "text-blue-600")} aria-hidden />
                    <div className="min-w-0">
                      <b className="block truncate text-sm font-[650] text-slate-900">{o.number}</b>
                      <span className={cn("block text-xs", o.late ? "text-red-600" : "text-slate-500")}>{due(o.dueDay)}</span>
                    </div>
                    {owner ? (
                      <Link to={`/invoices?ref=s${o.saleId}`} className={btn("sm")} aria-label={d.payInvoice(moneyC(o.balanceCents), o.number)}>
                        <span className="tabular-nums">{moneyC(o.balanceCents)}</span>
                      </Link>
                    ) : (
                      <b className="text-sm tabular-nums text-slate-900">{moneyC(o.balanceCents)}</b>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={CARD} aria-labelledby="cust-bought">
            <h2 id="cust-bought" className={CARD_TITLE}>{d.bought}</h2>
            {bought.length === 0 ? <p className="mt-2 text-sm text-slate-500">{d.nothingBought}</p> : (
              <ul className="mt-2 divide-y divide-slate-100">
                {bought.map((b) => (
                  <li key={b.name} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-slate-900">{b.name} <span className="text-xs text-slate-500">· {d.times(b.quantity)}</span></span>
                    <span className="shrink-0 tabular-nums text-slate-900">{moneyC(b.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** One history line in plain words. */
function eventText(e: TimelineEvent, t: ClientesCopy): string {
  const tl = t.detail.tl;
  const amt = moneyC(e.cents ?? 0);
  const num = e.number ?? "";
  const method = e.method ? t.methods[e.method] ?? e.method : "";
  switch (e.kind) {
    case "joined": return tl.joined;
    case "sale": return tl.sale(amt, method);
    case "invoice": return tl.invoice(num, amt);
    case "sent": return tl.sent(num);
    case "reminder": return tl.reminder(num);
    case "payment": return tl.payment(num, amt, method);
    case "refund": return tl.refund(num, amt);
    case "void": return tl.void(num);
    case "writeoff": return tl.writeoff(num, amt);
    case "late": return tl.late(num);
    case "cancelled": return tl.cancelled(num, amt);
    case "quote": return tl.quote(num, amt);
    case "quoteAccepted": return tl.quoteAccepted(num);
    case "quoteRejected": return tl.quoteRejected(num);
    case "quoteConverted": return tl.quoteConverted(num);
    default: return "";
  }
}
