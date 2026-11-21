import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AlertCircle, AlertTriangle, Bell, CalendarClock, Copy, FileDown, RotateCcw, Send, Trash2, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { invoicesCopy, type InvoicesCopy } from "@/i18n/copy/invoices";
import { PrintPortal } from "@/components/quotes/QuoteDocument";
import { newKey, parseMoney, priceInput, type CompanyInfo, type DraftLine, type ServiceOption } from "@/components/quotes/shared";
import { PAYMENT_METHODS, toCents, type PaymentMethod } from "../../../api/lib/quotes";
import { isOwed, type SendChannel } from "../../../api/lib/invoices";
import { DocPreview, type DocRow } from "./DocPreview";
import type { InvoicePreset } from "./InvoiceForm";
import { BackButton, Dst, MoneyInput, PopMenu, Timeline, type MenuItem } from "./proto";
import { CARD, FIELD, btn } from "./ui";
import { SendDialog } from "./SendDialog";
import {
  dueView, eventView, fmtDay, invoiceNumber, invoiceShareText, money, reminderText, stateView, useRefreshInvoices,
  type InvoiceDetail,
} from "./shared";

type Panel = "pay" | "refund" | "due" | "writeoff" | "void" | null;
export type DetailAction = "send" | "remind" | null;

/** One invoice: actions, the document as the client sees it, its history and what's left to collect. */
export function InvoiceDetailView({ invoiceRef, company, zelle, canChange, canManage = true, locale, services, initialAction, onActionDone, onBack, onIssued, onDuplicate }: {
  invoiceRef: string;
  company: CompanyInfo;
  zelle: string | null;
  canChange: boolean;
  /** Owner-only actions (due date, refund, write-off, void). */
  canManage?: boolean;
  locale: string;
  services: readonly ServiceOption[];
  /** Open the send / remind sheet right away (from a list button). */
  initialAction: DetailAction;
  onActionDone: () => void;
  onBack: () => void;
  /** A draft was issued: its reference changes to the sale's. */
  onIssued: (ref: string) => void;
  onDuplicate: (preset: InvoicePreset) => void;
}) {
  const t = useCopy(invoicesCopy);
  const query = trpc.invoices.get.useQuery({ ref: invoiceRef }, { retry: (n, e) => e.data?.code !== "NOT_FOUND" && n < 1 });
  const d = query.data;

  if (!d) {
    return (
      <>
        <BackButton label={t.detail.back} onClick={onBack} />
        {query.isError ? (
          <section className={cn(CARD, "grid justify-items-center gap-3 p-8 text-center")}>
            <AlertCircle className="h-6 w-6 text-red-600" aria-hidden="true" />
            <p className="text-sm text-slate-900" role="alert">{query.error.message || t.detail.notFound}</p>
            <button type="button" className={btn()} onClick={() => void query.refetch()}>{t.retry}</button>
          </section>
        ) : (
          <div className="grid gap-3" role="status" aria-label={t.detail.loading}>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-11 w-72 rounded-[10px]" />
            <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"><Skeleton className="h-96 rounded-[14px]" /><Skeleton className="h-48 rounded-[14px]" /></div>
          </div>
        )}
      </>
    );
  }
  return (
    <Loaded
      key={d.ref} d={d} t={t} company={company} zelle={zelle} canChange={canChange} canManage={canManage} locale={locale} services={services}
      initialAction={initialAction} onActionDone={onActionDone} onBack={onBack} onIssued={onIssued} onDuplicate={onDuplicate}
    />
  );
}

function Loaded({ d, t, company, zelle, canChange, canManage = true, locale, services, initialAction, onActionDone, onBack, onIssued, onDuplicate }: {
  d: InvoiceDetail;
  t: InvoicesCopy;
  company: CompanyInfo;
  zelle: string | null;
  canChange: boolean;
  /** Owner-only actions (due date, refund, write-off, void). */
  canManage?: boolean;
  locale: string;
  services: readonly ServiceOption[];
  initialAction: DetailAction;
  onActionDone: () => void;
  onBack: () => void;
  onIssued: (ref: string) => void;
  onDuplicate: (preset: InvoicePreset) => void;
}) {
  const refresh = useRefreshInvoices();
  const [panel, setPanel] = useState<Panel>(null);
  const [sheet, setSheet] = useState<DetailAction>(initialAction);
  const onError = (e: { message: string }) => toast.error(e.message || t.toasts.error);

  const issue = trpc.invoices.issue.useMutation({
    onSuccess: (r) => { toast.success(t.toasts.issued); refresh(); onIssued(r.ref); },
    onError,
  });
  const voidIt = trpc.invoices.void.useMutation({ onSuccess: () => { toast.success(t.toasts.voided); setPanel(null); refresh(); }, onError });
  const writeOff = trpc.invoices.writeOff.useMutation({ onSuccess: () => { toast.success(t.toasts.writtenOff); setPanel(null); refresh(); }, onError });
  const markSent = trpc.invoices.markSent.useMutation({ onSuccess: () => refresh() });
  const markReminded = trpc.invoices.markReminded.useMutation({ onSuccess: () => { toast.success(t.toasts.reminded); refresh(); } });

  const num = invoiceNumber(d, t);
  const st = stateView(d, t);
  const due = dueView(d, d.today, t, locale);
  const owed = isOwed(d.state);
  const isDraft = d.state === "draft";
  const busy = issue.isPending || voidIt.isPending || writeOff.isPending;
  const day = (iso: string | null) => fmtDay(iso, locale, d.today);
  const printNow = () => window.print();

  const duplicate = () => onDuplicate({
    customer: { id: d.customerId, name: d.customerName ?? "" },
    lines: d.items.map((it): DraftLine => {
      const svc = services.find((s) => s.name === it.description && Math.round(s.price * 100) === it.unitPriceCents);
      return {
        key: newKey(), serviceId: svc?.id ?? null, description: it.description, quantity: String(it.quantity),
        unitPrice: priceInput(it.unitPriceCents / 100), custom: !svc,
      };
    }),
    discount: d.discountCents / 100,
    notes: d.notes,
    termsDays: d.termsDays,
  });

  const menu: MenuItem[] = [];
  if (canChange && !isDraft && d.state !== "void") menu.push({ key: "send", label: t.detail.menu.send, icon: Send, onSelect: () => setSheet("send") });
  menu.push({ key: "pdf", label: t.detail.menu.pdf, icon: FileDown, onSelect: printNow });
  if (canChange) menu.push({ key: "dup", label: t.detail.menu.duplicate, icon: Copy, onSelect: duplicate });
  if (canChange && canManage && owed) menu.push({ key: "due", label: t.detail.menu.due, icon: CalendarClock, onSelect: () => setPanel("due") });
  if (canChange && canManage && d.netPaidCents > 0 && (owed || d.state === "paid")) menu.push("sep", { key: "refund", label: t.detail.menu.refund, icon: RotateCcw, onSelect: () => setPanel("refund") });
  if (canChange && canManage && owed) menu.push("sep", { key: "wo", label: t.detail.menu.writeoff, icon: X, onSelect: () => setPanel("writeoff"), danger: true });
  if (canChange && canManage && (isDraft || owed)) menu.push({ key: "void", label: t.detail.menu.void, icon: Trash2, onSelect: () => setPanel("void"), danger: true });

  const actions: ReactNode = !canChange ? null : isDraft ? (
    <button type="button" className={btn("primary")} disabled={busy} onClick={() => issue.mutate({ ref: d.ref })}>
      <Send className="h-4 w-4" aria-hidden="true" />{t.detail.sendIssue}
    </button>
  ) : owed ? (
    <>
      <button type="button" className={btn("primary")} onClick={() => setPanel(panel === "pay" ? null : "pay")} aria-expanded={panel === "pay"}>{t.detail.pay}</button>
      <button type="button" className={btn()} onClick={() => setSheet("remind")}><Bell className="h-4 w-4" aria-hidden="true" />{t.detail.remind}</button>
    </>
  ) : null;

  const extra: DocRow[] = [];
  if (d.paidCents > 0) extra.push({ label: t.doc.paid, cents: d.paidCents, minus: true });
  if (d.refundedCents > 0) extra.push({ label: t.doc.refunded, cents: d.refundedCents });
  if (d.writtenOffCents > 0) extra.push({ label: t.doc.writtenOff, cents: d.writtenOffCents, minus: true });
  if (d.paidCents > 0 || d.writtenOffCents > 0) extra.push({ label: t.doc.balance, cents: d.balanceCents, strong: true });

  const doc = (print: boolean) => (
    <DocPreview
      print={print}
      company={company}
      title={`${t.doc.invoice} ${num}`}
      meta={[t.doc.date(day(d.issueDate ?? d.createdOn)), d.dueDate && !isDraft ? t.doc.due(day(d.dueDate)) : t.doc.unsent]}
      customerName={d.customerName}
      lines={d.items}
      subtotalCents={d.subtotalCents}
      discountCents={d.discountCents}
      totalCents={d.totalCents}
      extra={extra}
      notes={d.notes}
      labels={{ to: t.doc.to, service: t.doc.service, qty: t.doc.qty, price: t.doc.price, amount: t.doc.amount, subtotal: t.doc.subtotal, discount: t.doc.discount, total: t.doc.total }}
      pay={owed || isDraft ? (
        <>
          <b className="text-sm font-bold text-slate-900">{t.doc.payTitle(money(isDraft ? d.totalCents : d.balanceCents))}</b>
          <span>{zelle ? t.doc.payZelle(zelle) : t.doc.payPlain}</span>
        </>
      ) : undefined}
    />
  );

  const events = [...d.events].reverse().map((e) => ({ id: e.id, day: day(e.day), ...eventView(e, t, locale, d.today) }));
  const allOff = !d.reminders.before && !d.reminders.onDue && !d.reminders.after && !d.reminders.weekly;

  const sendText = sheet === "remind" ? reminderText(d, t, zelle, locale) : invoiceShareText(d, t, company, zelle, locale);
  const onSent = (channel: SendChannel) => {
    if (sheet === "remind") markReminded.mutate({ ref: d.ref, channel });
    else {
      markSent.mutate({ ref: d.ref, channel });
      toast.success(t.toasts.sent);
    }
  };

  return (
    <>
      <BackButton label={t.detail.back} onClick={onBack} />
      {/* .head: title; the client, when it's due and the status on one line (as on the prototype's phone too). */}
      <div className="mb-[18px] min-w-0">
        <h1 className="break-words text-[22px] font-[750] leading-tight tracking-tight text-slate-900">{isDraft ? t.detail.draftTitle : t.detail.title(num)}</h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          <p className="min-w-0">
            {d.customerId ? (
              <Link to="/customers" className="font-semibold text-blue-600 hover:underline">{d.customerName || t.noClient}</Link>
            ) : (
              <span className="font-semibold text-slate-900">{d.customerName || t.noClient}</span>
            )}
            {" · "}
            <span className={due.tone === "bad" ? "text-red-600" : due.tone === "warn" ? "text-amber-700" : undefined}>{due.text}</span>
          </p>
          <span className="ml-auto"><Dst label={st.label} tone={st.tone} /></span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <PopMenu label={t.detail.more} items={menu} />
      </div>

      {panel === "pay" && <PayForm d={d} t={t} onDone={() => setPanel(null)} />}
      {panel === "refund" && <RefundForm d={d} t={t} onDone={() => setPanel(null)} />}
      {panel === "due" && <DueForm d={d} t={t} onDone={() => setPanel(null)} />}
      {panel === "writeoff" && (
        <Confirm
          text={d.netPaidCents > 0 ? `${t.detail.writeoff.text} ${t.detail.writeoff.partial(money(d.netPaidCents), money(d.balanceCents))}` : t.detail.writeoff.text}
          confirm={t.detail.writeoff.confirm} cancel={t.detail.cancel} busy={writeOff.isPending}
          onConfirm={() => writeOff.mutate({ ref: d.ref })} onCancel={() => setPanel(null)}
        />
      )}
      {panel === "void" && (
        <Confirm
          text={d.netPaidCents > 0 ? `${t.detail.void.text} ${t.detail.void.paid(money(d.netPaidCents))}` : t.detail.void.text}
          confirm={t.detail.void.confirm} cancel={t.detail.cancel} busy={voidIt.isPending}
          onConfirm={() => voidIt.mutate({ ref: d.ref })} onCancel={() => setPanel(null)}
        />
      )}

      <div className="mt-3.5 grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {doc(false)}
        <div className="grid gap-3">
          <section className={CARD} aria-labelledby="inv-history">
            <h2 id="inv-history" className="text-[15px] font-bold text-slate-900">{t.detail.history}</h2>
            <Timeline items={events} />
          </section>
          {owed && (
            <section className={CARD} aria-labelledby="inv-collect">
              <h2 id="inv-collect" className="text-[15px] font-bold text-slate-900">{t.detail.collect}</h2>
              <dl className="mt-2.5 grid gap-2.5 text-sm">
                <div className="grid gap-px"><dt className="text-xs text-slate-500">{t.detail.owedNow}</dt><dd className="font-bold tabular-nums text-slate-900">{money(d.balanceCents)}</dd></div>
                {d.netPaidCents > 0 && <div className="grid gap-px"><dt className="text-xs text-slate-500">{t.detail.paidSoFar}</dt><dd className="tabular-nums text-slate-900">{money(d.netPaidCents)}</dd></div>}
                <div className="grid gap-px"><dt className="text-xs text-slate-500">{t.detail.howToPay}</dt><dd className="break-words text-slate-900">{zelle ? t.detail.howToPayZelle(zelle) : t.detail.howToPayPlain}</dd></div>
                <div className="grid gap-px">
                  <dt className="text-xs text-slate-500">{t.detail.nextReminder}</dt>
                  <dd className="text-slate-900">
                    {d.reminderDue ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700"><AlertTriangle className="h-4 w-4" aria-hidden="true" />{t.detail.reminderToday}</span>
                    ) : d.nextReminder ? t.detail.reminderWhen[d.nextReminder.kind](day(d.nextReminder.date))
                      : allOff ? t.detail.remindersOff : t.detail.noMoreReminders}
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </div>

      <PrintPortal>{doc(true)}</PrintPortal>

      <SendDialog
        open={sheet !== null}
        onClose={() => { setSheet(null); onActionDone(); }}
        title={sheet === "remind" ? t.send.remindTitle(d.customerName || t.noClient) : t.send.title(num)}
        recipient={d.customerName}
        phone={d.contact?.phone ?? null}
        email={d.contact?.email ?? null}
        subject={sheet === "remind" ? t.share.remindSubject(num) : t.share.subject(num, company.name)}
        initialText={sendText}
        withPdf={sheet === "send"}
        onPdf={printNow}
        onSent={onSent}
        t={t.send}
      />
    </>
  );
}

/** `.subrow.rule`: a yes / cancel question under the actions. */
function Confirm({ text, confirm, cancel, busy, onConfirm, onCancel }: { text: string; confirm: string; cancel: string; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-200 pt-2.5 text-[13px] text-slate-900" role="alert">
      <AlertTriangle className="h-[15px] w-[15px] flex-none text-blue-600" aria-hidden="true" />
      <span className="min-w-0 flex-[1_1_200px]">{text}</span>
      <button type="button" className={btn("sm", "primary")} disabled={busy} onClick={onConfirm}>{confirm}</button>
      <button type="button" className={btn("sm")} onClick={onCancel}>{cancel}</button>
    </div>
  );
}

const INLINE = "mt-3 flex flex-wrap items-end gap-2.5 rounded-xl bg-slate-100 p-3";
const SELECT = cn(FIELD, "w-full sm:w-auto");

function MethodSelect({ label, value, onChange, t }: { label: string; value: PaymentMethod; onChange: (m: PaymentMethod) => void; t: InvoicesCopy }) {
  const id = useId();
  return (
    <label htmlFor={id} className="grid w-full gap-1 text-xs font-semibold text-slate-500 sm:w-auto">
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as PaymentMethod)} className={SELECT}>
        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}
      </select>
    </label>
  );
}

/** The prototype's `#payForm`: amount (all of it by default) and how they paid. */
function PayForm({ d, t, onDone }: { d: InvoiceDetail; t: InvoicesCopy; onDone: () => void }) {
  const refresh = useRefreshInvoices();
  const helpId = useId();
  const [amount, setAmount] = useState(() => priceInput(d.balanceCents / 100));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const pay = trpc.invoices.pay.useMutation({
    onSuccess: (r) => { toast.success(r.paid ? t.toasts.paidFull : t.toasts.paid(money(r.amountCents))); refresh(); onDone(); },
    onError: (e) => setError(e.message || t.toasts.error),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = parseMoney(amount);
    if (v === null || v <= 0) return setError(t.detail.payForm.bad);
    if (toCents(v) > d.balanceCents) return setError(t.detail.payForm.tooMuch(money(d.balanceCents)));
    setError(null);
    pay.mutate({ ref: d.ref, amount: v, method });
  };
  return (
    <form className={INLINE} onSubmit={submit} noValidate>
      <MoneyInput label={t.detail.payForm.amount} value={amount} onChange={(v) => { setAmount(v); setError(null); }} invalid={!!error} describedBy={helpId} autoFocus />
      <MethodSelect label={t.detail.payForm.method} value={method} onChange={setMethod} t={t} />
      <button type="submit" className={btn("primary", "w-full sm:w-auto")} disabled={pay.isPending}>{pay.isPending ? t.detail.payForm.saving : t.detail.payForm.save}</button>
      <button type="button" className={btn("w-full sm:w-auto")} onClick={onDone}>{t.detail.payForm.cancel}</button>
      {error && <p role="alert" className="basis-full text-xs text-red-600">{error}</p>}
      <p id={helpId} className="basis-full text-xs text-slate-500">{t.detail.payForm.help}</p>
    </form>
  );
}

/** The prototype's `#refundForm`, plus how the money went back (it decides the account in the books). */
function RefundForm({ d, t, onDone }: { d: InvoiceDetail; t: InvoicesCopy; onDone: () => void }) {
  const refresh = useRefreshInvoices();
  const id = useId();
  const lastMethod = [...d.payments].reverse().find((p) => p.kind === "payment")?.method ?? "cash";
  const [amount, setAmount] = useState(() => priceInput(d.netPaidCents / 100));
  const [method, setMethod] = useState<PaymentMethod>(lastMethod);
  const [reason, setReason] = useState(t.detail.refundForm.reasons[0]);
  const [error, setError] = useState<string | null>(null);
  const refund = trpc.invoices.refund.useMutation({
    onSuccess: () => { toast.success(t.toasts.refunded(amount ? money(toCents(parseMoney(amount) ?? 0)) : "")); refresh(); onDone(); },
    onError: (e) => setError(e.message || t.toasts.error),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = parseMoney(amount);
    if (v === null || v <= 0) return setError(t.detail.payForm.bad);
    if (toCents(v) > d.netPaidCents) return setError(t.detail.refundForm.tooMuch(money(d.netPaidCents)));
    setError(null);
    refund.mutate({ ref: d.ref, amount: v, method, reason });
  };
  return (
    <form className={INLINE} onSubmit={submit} noValidate>
      <MoneyInput label={t.detail.refundForm.amount} value={amount} onChange={(v) => { setAmount(v); setError(null); }} invalid={!!error} autoFocus />
      <MethodSelect label={t.detail.refundForm.method} value={method} onChange={setMethod} t={t} />
      <label htmlFor={`${id}-why`} className="grid w-full gap-1 text-xs font-semibold text-slate-500 sm:w-auto">
        {t.detail.refundForm.why}
        <select id={`${id}-why`} value={reason} onChange={(e) => setReason(e.target.value)} className={SELECT}>
          {t.detail.refundForm.reasons.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <button type="submit" className={btn("primary", "w-full sm:w-auto")} disabled={refund.isPending}>{t.detail.refundForm.save}</button>
      <button type="button" className={btn("w-full sm:w-auto")} onClick={onDone}>{t.detail.cancel}</button>
      {error && <p role="alert" className="basis-full text-xs text-red-600">{error}</p>}
      <p className="basis-full text-xs text-slate-500">{t.detail.refundForm.help}</p>
    </form>
  );
}

function DueForm({ d, t, onDone }: { d: InvoiceDetail; t: InvoicesCopy; onDone: () => void }) {
  const refresh = useRefreshInvoices();
  const id = useId();
  const [date, setDate] = useState(d.dueDate ?? d.today);
  const [error, setError] = useState<string | null>(null);
  const save = trpc.invoices.setDueDate.useMutation({
    onSuccess: () => { toast.success(t.toasts.due); refresh(); onDone(); },
    onError: (e) => setError(e.message || t.toasts.error),
  });
  const min = d.issueDate ?? undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (min && date < min)) return setError(t.detail.dueForm.bad);
    setError(null);
    save.mutate({ ref: d.ref, dueDate: date });
  };
  return (
    <form className={INLINE} onSubmit={submit} noValidate>
      <label htmlFor={id} className="grid w-full gap-1 text-xs font-semibold text-slate-500 sm:w-auto">
        {t.detail.dueForm.label}
        <input id={id} type="date" value={date} min={min} onChange={(e) => { setDate(e.target.value); setError(null); }} className={SELECT} />
      </label>
      <button type="submit" className={btn("primary", "w-full sm:w-auto")} disabled={save.isPending}>{t.detail.dueForm.save}</button>
      <button type="button" className={btn("w-full sm:w-auto")} onClick={onDone}>{t.detail.cancel}</button>
      {error && <p role="alert" className="basis-full text-xs text-red-600">{error}</p>}
    </form>
  );
}
