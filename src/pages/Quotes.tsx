// Cotizaciones (business Pro and Negocio): estimates sent to clients, and when they accept,
// turned into an invoice in Facturas (to collect, or paid on the spot). Recurring invoices
// live under Facturas now (/invoices?view=recurring); the old /quotes?tab=recurring goes there.
// Team (api/lib/team.ts): staff never reach this page (AppLayout); the accountant only reads.
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { Info, Lock, Plus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { quotesCopy } from "@/i18n/copy/quotes";
import { QuotesListView, type QuoteFilter } from "@/components/quotes/QuotesList";
import { QuoteBuilderDialog, type BuilderState } from "@/components/quotes/QuoteBuilder";
import { QuoteDetailDialog, type QuoteOpen } from "@/components/quotes/QuoteDetailDialog";
import { toCompanyInfo, toCustomerOptions, toServiceOptions } from "@/components/quotes/shared";
import { useRunDueOnce } from "@/components/quotes/useRunDue";
import { useNewParam } from "@/components/invoices/useNewParam";
import { PageHead } from "@/components/invoices/proto";
import { btn } from "@/components/invoices/ui";
import { localIsoDate } from "../../api/lib/quotes";

type CustomerRow = { id: number; phone?: string | null; email?: string | null };

export default function Quotes() {
  const [params] = useSearchParams();
  if (params.get("tab") === "recurring") return <Navigate to="/invoices?view=recurring" replace />;
  return <QuotesPage />;
}

function QuotesPage() {
  const t = useCopy(quotesCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const navigate = useNavigate();
  const [today] = useState(() => localIsoDate(new Date()));
  const [filter, setFilter] = useState<QuoteFilter>("all");
  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [open, setOpen] = useState<QuoteOpen | null>(null);

  const plan = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const planLacks = plan.data ? !plan.data.features.includes("quotes") : false;
  const membership = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const canChange = membership.data?.role !== "accountant";
  const ready = !!plan.data && !planLacks;
  const list = trpc.quotes.list.useQuery(undefined, { enabled: ready, retry: (n, e) => e.data?.code !== "FORBIDDEN" && n < 1 });
  const services = trpc.services.list.useQuery(undefined, { staleTime: 60_000, enabled: ready });
  const customers = trpc.customers.list.useQuery({ type: "all", limit: 200 }, { staleTime: 60_000, enabled: ready });
  const settings = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000, enabled: ready });
  const serviceOptions = useMemo(() => toServiceOptions(services.data), [services.data]);
  const customerOptions = useMemo(() => toCustomerOptions(customers.data), [customers.data]);
  const company = useMemo(() => toCompanyInfo(settings.data), [settings.data]);
  const contacts = useMemo(() => {
    const m = new Map<number, { phone: string | null; email: string | null }>();
    for (const c of (customers.data ?? []) as CustomerRow[]) m.set(Number(c.id), { phone: c.phone ?? null, email: c.email ?? null });
    return m;
  }, [customers.data]);
  useRunDueOnce(ready && membership.isFetched && canChange);
  // "+ Nuevo → Cotización" links to /quotes?new=1 (services first, so the form starts with one).
  useNewParam(() => setBuilder({ mode: "create" }), !!plan.data && membership.isFetched && (planLacks || services.isFetched), ready && canChange);
  const forbidden = list.error?.data?.code === "FORBIDDEN";

  const seeInvoice = (saleId: number) => navigate(`/invoices?id=s${saleId}`);
  const head = (
    <PageHead
      title={t.title}
      sub={t.subtitle}
      right={ready && canChange && !forbidden && (
        <button type="button" className={btn("primary", "w-full sm:w-auto")} onClick={() => setBuilder({ mode: "create" })}>
          <Plus className="h-4 w-4" aria-hidden="true" />{t.newQuote}
        </button>
      )}
    />
  );

  if (planLacks || forbidden) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl">
          {head}
          {/* .lock — with the plan but still refused (a team member's access), the server says why. */}
          <section className="grid min-w-0 justify-items-start gap-1.5 rounded-[14px] border border-dashed border-slate-200 bg-slate-100 p-[18px]">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{t.locked.badge}</span>
            <h2 className="text-[15px] font-bold text-slate-900">{t.locked.title}</h2>
            <p className="mb-1 text-[13px] text-slate-500">{planLacks ? t.locked.text : list.error?.message || t.locked.text}</p>
            {planLacks && <button type="button" className={btn("sm")} onClick={() => navigate("/settings?sec=plan")}>{t.locked.cta}</button>}
          </section>
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {head}
        {!canChange && (
          <p className="mb-4 flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />{t.readOnly}
          </p>
        )}
        {list.isError ? (
          <p className="text-sm text-red-600" role="alert">
            {list.error.message || t.error}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void list.refetch()}>{t.retry}</button>
          </p>
        ) : (
          <QuotesListView
            items={list.data?.items ?? []}
            loading={!ready || list.isLoading}
            today={today}
            locale={locale}
            filter={filter}
            onFilter={setFilter}
            canChange={canChange}
            onNew={() => setBuilder({ mode: "create" })}
            onOpen={(id) => setOpen({ id, view: "detail", sheet: null })}
            onRemind={(id) => setOpen({ id, view: "detail", sheet: "remind" })}
            onSend={(id) => setOpen({ id, view: "detail", sheet: "send" })}
            onConvert={(id) => setOpen({ id, view: "convert", sheet: null })}
            onSeeInvoice={seeInvoice}
          />
        )}
      </div>

      <QuoteDetailDialog
        open={open}
        company={company}
        contactOf={(id) => (id !== null ? contacts.get(id) : undefined) ?? { phone: null, email: null }}
        canChange={canChange}
        onClose={() => setOpen(null)}
        onEdit={(id) => { setOpen(null); setBuilder({ mode: "edit", id }); }}
        onConverted={(ref, pending) => { setOpen(null); navigate(`/invoices?id=${ref}${pending ? "&do=send" : ""}`); }}
        onSeeInvoice={(saleId) => { setOpen(null); seeInvoice(saleId); }}
      />
      <QuoteBuilderDialog
        state={builder}
        services={serviceOptions}
        customers={customerOptions}
        onClose={() => setBuilder(null)}
        onSaved={(id, send) => { setBuilder(null); setOpen({ id, view: "detail", sheet: send ? "send" : null }); }}
      />
    </AnimatedPage>
  );
}
