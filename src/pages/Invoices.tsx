// Facturas (every business plan): what clients owe, what's overdue, what came in this month;
// each invoice with its document, history, payments (full or partial), refunds, void and the
// reminders the user sends from their own WhatsApp or email (the app has no email service).
// Server: api/invoices-router.ts. Cotizaciones and recurring invoices (Pro and Negocio) link here.
// Team (api/lib/team.ts): the accountant only reads; staff don't have Facturas in their role.
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Info, Lock, Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { invoicesCopy } from "@/i18n/copy/invoices";
import { RecurringTab, type RecurringFormState } from "@/components/quotes/RecurringTab";
import { toCompanyInfo, toCustomerOptions, toServiceOptions } from "@/components/quotes/shared";
import { useRunDueOnce } from "@/components/quotes/useRunDue";
import { InvoiceListView, LockedCard } from "@/components/invoices/InvoiceList";
import { InvoiceDetailView, type DetailAction } from "@/components/invoices/InvoiceDetail";
import { InvoiceFormDialog, type InvoicePreset } from "@/components/invoices/InvoiceForm";
import { RemindersDialog } from "@/components/invoices/RemindersDialog";
import { BackButton, PageHead } from "@/components/invoices/proto";
import { btn } from "@/components/invoices/ui";
import { useRefreshInvoices, zelleOf } from "@/components/invoices/shared";
import { useNewParam } from "@/components/invoices/useNewParam";
import { DEFAULT_REMINDERS, type InvoiceFilter } from "../../api/lib/invoices";

const scrollTop = () => document.querySelector("main")?.scrollTo({ top: 0 });

export default function Invoices() {
  const t = useCopy(invoicesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const ref = params.get("id");
  const view = params.get("view") === "recurring" ? "recurring" : null;
  const doParam = params.get("do");
  const initialAction: DetailAction = doParam === "send" || doParam === "remind" ? doParam : null;

  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [form, setForm] = useState<{ preset: InvoicePreset | null } | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [recurringForm, setRecurringForm] = useState<RecurringFormState | null>(null);
  const [busyRef, setBusyRef] = useState<string | null>(null);

  const membership = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const canChange = membership.data?.role !== "accountant";
  /** Team members (employees, accountant) never get the owner's tools: void, refund, write-off, due dates, settings, quotes. */
  const isOwner = membership.isFetched && !membership.data;
  const list = trpc.invoices.list.useQuery(undefined, { retry: (n, e) => e.data?.code !== "FORBIDDEN" && n < 1 });
  const services = trpc.services.list.useQuery(undefined, { staleTime: 60_000, enabled: !list.error });
  const customers = trpc.customers.list.useQuery({ type: "all", limit: 200 }, { staleTime: 60_000, enabled: !list.error });
  const settings = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000, enabled: !list.error });
  const serviceOptions = useMemo(() => toServiceOptions(services.data), [services.data]);
  const customerOptions = useMemo(() => toCustomerOptions(customers.data), [customers.data]);
  const company = useMemo(() => toCompanyInfo(settings.data), [settings.data]);
  const zelle = zelleOf(settings.data);
  const canQuotes = list.data?.canQuotes ?? false;
  const refresh = useRefreshInvoices();
  useRunDueOnce(canQuotes && isOwner);
  // "+ Nuevo → Factura" links to /invoices?new=1 (services first, so the form starts with one).
  useNewParam(() => setForm({ preset: null }), membership.isFetched && services.isFetched, canChange);

  const go = (p: Record<string, string>, replace = false) => {
    setParams(p, { replace });
    scrollTop();
  };
  const issue = trpc.invoices.issue.useMutation({
    onSuccess: (r) => { toast.success(t.toasts.issued); refresh(); go({ id: r.ref, do: "send" }); },
    onError: (e) => toast.error(e.message || t.toasts.error),
    onSettled: () => setBusyRef(null),
  });
  const dropAction = () => {
    if (!ref) return;
    setParams({ id: ref }, { replace: true });
  };

  const forbidden = list.error?.data?.code === "FORBIDDEN";
  if (forbidden) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <section className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Lock className="h-6 w-6" aria-hidden="true" /></span>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{t.locked.title}</h1>
          <p className="mt-2 text-sm text-slate-600">{list.error?.message || t.locked.text}</p>
          <button type="button" className={btn("primary", "mt-6 w-full")} onClick={() => navigate("/settings?sec=plan")}>{t.locked.cta}</button>
        </section>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {!canChange && (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />{t.readOnly}
          </p>
        )}

        {view === "recurring" ? (
          <>
            <BackButton label={t.recurring.back} onClick={() => go({})} />
            <PageHead
              title={t.recurring.title}
              sub={t.recurring.sub}
              right={canQuotes && canChange && (
                <button type="button" className={btn("primary", "w-full sm:w-auto")} onClick={() => setRecurringForm({ mode: "create" })}>
                  <Plus className="h-4 w-4" aria-hidden="true" />{t.recurring.new}
                </button>
              )}
            />
            {canQuotes ? (
              <RecurringTab services={serviceOptions} customers={customerOptions} canChange={isOwner} form={recurringForm} onForm={setRecurringForm} />
            ) : list.data ? (
              <LockedCard title={t.tools.recurring} text={t.tools.lockedTitle} cta={t.locked.cta} onCta={() => navigate("/settings?sec=plan")} />
            ) : null}
          </>
        ) : ref ? (
          <InvoiceDetailView
            canManage={isOwner}
            key={ref}
            invoiceRef={ref}
            company={company}
            zelle={zelle}
            canChange={canChange}
            locale={locale}
            services={serviceOptions}
            initialAction={canChange ? initialAction : null}
            onActionDone={dropAction}
            onBack={() => go({})}
            onIssued={(r) => go({ id: r, do: "send" }, true)}
            onDuplicate={(preset) => setForm({ preset })}
          />
        ) : (
          <InvoiceListView
            ownerTools={isOwner}
            data={list.data}
            loading={list.isLoading}
            locale={locale}
            filter={filter}
            onFilter={setFilter}
            canChange={canChange}
            canQuotes={canQuotes}
            busyRef={busyRef}
            onNew={() => setForm({ preset: null })}
            onOpen={(r) => go({ id: r })}
            onRemind={(r) => go({ id: r, do: "remind" })}
            onIssue={(r) => { setBusyRef(r); issue.mutate({ ref: r }); }}
            onReminders={() => setRemindersOpen(true)}
            onQuotes={() => navigate("/quotes")}
            onRecurring={() => go({ view: "recurring" })}
            onLogo={() => navigate("/settings?sec=negocio")}
            onLocked={() => navigate("/settings?sec=plan")}
          />
        )}
        {list.isError && !forbidden && !ref && (
          <p className="mt-4 text-sm text-red-600" role="alert">
            {list.error.message || t.error}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void list.refetch()}>{t.retry}</button>
          </p>
        )}
      </div>

      <InvoiceFormDialog
        open={form !== null}
        preset={form?.preset ?? null}
        services={serviceOptions}
        customers={customerOptions}
        onClose={() => setForm(null)}
        onCreated={(r, issued) => {
          setForm(null);
          refresh();
          if (issued) toast.success(t.toasts.created);
          go(issued ? { id: r, do: "send" } : { id: r });
        }}
      />
      <RemindersDialog
        open={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        settings={list.data?.reminders ?? DEFAULT_REMINDERS}
        canChange={isOwner}
      />
    </AnimatedPage>
  );
}
