import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ClipboardList, Info, Lock, Plus, Repeat } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { quotesCopy } from "@/i18n/copy/quotes";
import { QuotesTab } from "@/components/quotes/QuotesTab";
import { RecurringTab, type RecurringFormState } from "@/components/quotes/RecurringTab";
import { Receivables } from "@/components/quotes/Receivables";
import type { BuilderState } from "@/components/quotes/QuoteBuilder";
import { toCompanyInfo, toCustomerOptions, toServiceOptions, useRefreshQuotes } from "@/components/quotes/shared";
import { BTN, TABS } from "@/components/quotes/ui";

type Tab = "quotes" | "recurring";

// Cotizaciones y facturas recurrentes (business Pro and Negocio).
// Team (api/lib/team.ts): staff never reach this page (AppLayout); the accountant only reads.
export default function Quotes() {
  const t = useCopy(quotesCopy);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "recurring" ? "recurring" : "quotes";
  // The quote builder and the recurring form open from the header too, so their state lives here.
  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [recurringForm, setRecurringForm] = useState<RecurringFormState | null>(null);

  const plan = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const planLacks = plan.data ? !plan.data.features.includes("quotes") : false;
  const membershipQ = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const canChange = membershipQ.data?.role !== "accountant";
  const ready = !!plan.data && !planLacks;
  const receivables = trpc.quotes.receivables.useQuery(undefined, {
    enabled: ready,
    retry: (count, err) => err.data?.code !== "FORBIDDEN" && count < 1,
  });
  const forbidden = receivables.error?.data?.code === "FORBIDDEN";

  if (planLacks || forbidden) {
    return (
      <AnimatedPage className="p-4 lg:p-8">
        <section className="mx-auto mt-6 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600"><Lock className="h-6 w-6" aria-hidden="true" /></span>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">{t.locked.title}</h1>
          {/* With the plan but still refused (e.g. a team member's access): the server says why. */}
          <p className="mt-2 text-sm text-slate-600">{planLacks ? t.locked.text : receivables.error?.message || t.locked.text}</p>
          {planLacks && (
            <button type="button" className={cn(BTN.primary, "mt-6 w-full")} onClick={() => navigate("/settings")}>{t.locked.cta}</button>
          )}
        </section>
      </AnimatedPage>
    );
  }

  const newLabel = tab === "recurring" ? t.recurring.new : t.quotes.new;
  const openNew = () => (tab === "recurring" ? setRecurringForm({ mode: "create" }) : setBuilder({ mode: "create" }));

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{t.subtitle}</p>
          </div>
          {ready && canChange && (
            <button type="button" className={cn(BTN.primary, "w-full sm:w-auto")} onClick={openNew}>
              <Plus className="h-4 w-4" aria-hidden="true" />{newLabel}
            </button>
          )}
        </header>

        {!canChange && (
          <p className="flex items-start gap-2 rounded-xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />{t.ui.readOnly}
          </p>
        )}

        {!ready ? (
          <div className="space-y-3" role="status" aria-label={t.loading}>
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-11 w-64 rounded-xl" />
            <div className="grid gap-3 lg:grid-cols-2"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
          </div>
        ) : (
          <QuotesWorkspace
            tab={tab}
            onTab={(v) => setParams(v === "recurring" ? { tab: "recurring" } : {}, { replace: true })}
            receivables={receivables.data}
            receivablesLoading={receivables.isLoading}
            receivablesError={receivables.isError && !receivables.data}
            onRetryReceivables={() => void receivables.refetch()}
            canChange={canChange}
            runDue={membershipQ.isFetched && canChange}
            builder={builder}
            onBuilder={setBuilder}
            recurringForm={recurringForm}
            onRecurringForm={setRecurringForm}
          />
        )}
      </div>
    </AnimatedPage>
  );
}

function QuotesWorkspace({
  tab, onTab, receivables, receivablesLoading, receivablesError, onRetryReceivables, canChange, runDue, builder, onBuilder, recurringForm, onRecurringForm,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  receivables: Parameters<typeof Receivables>[0]["items"] | undefined;
  receivablesLoading: boolean;
  receivablesError: boolean;
  onRetryReceivables: () => void;
  canChange: boolean;
  /** Run the due recurring invoices once the member's role is known (never for read-only members). */
  runDue: boolean;
  builder: BuilderState | null;
  onBuilder: (b: BuilderState | null) => void;
  recurringForm: RecurringFormState | null;
  onRecurringForm: (f: RecurringFormState | null) => void;
}) {
  const t = useCopy(quotesCopy);
  const services = trpc.services.list.useQuery(undefined, { staleTime: 60_000 });
  const customers = trpc.customers.list.useQuery({ type: "all", limit: 200 }, { staleTime: 60_000 });
  const settings = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const serviceOptions = useMemo(() => toServiceOptions(services.data), [services.data]);
  const customerOptions = useMemo(() => toCustomerOptions(customers.data), [customers.data]);
  const company = useMemo(() => toCompanyInfo(settings.data), [settings.data]);
  useRunDueOnce(runDue);

  return (
    <div className="space-y-5">
      <Receivables items={receivables ?? []} loading={receivablesLoading} error={receivablesError} onRetry={onRetryReceivables} canChange={canChange} />
      <Tabs value={tab} onValueChange={(v) => onTab(v === "recurring" ? "recurring" : "quotes")} className="gap-4">
        <TabsList aria-label={t.tabs.label} className={TABS.list}>
          <TabsTrigger value="quotes" className={TABS.trigger}>
            <ClipboardList aria-hidden="true" /> {t.tabs.quotes}
          </TabsTrigger>
          <TabsTrigger value="recurring" className={TABS.trigger}>
            <Repeat aria-hidden="true" /> {t.tabs.recurring}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="quotes">
          <QuotesTab
            services={serviceOptions} customers={customerOptions} company={company}
            canChange={canChange} builder={builder} onBuilder={onBuilder}
          />
        </TabsContent>
        <TabsContent value="recurring">
          <RecurringTab
            services={serviceOptions} customers={customerOptions}
            canChange={canChange} form={recurringForm} onForm={onRecurringForm}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Creates the recurring sales that are due when the page opens (the server timer does it too;
 * running twice is harmless). Says so only when something was created. Not for read-only members.
 */
function useRunDueOnce(enabled: boolean) {
  const t = useCopy(quotesCopy);
  const refresh = useRefreshQuotes();
  const ran = useRef(false);
  const { mutate } = trpc.quotes.recurring.runDue.useMutation({
    onSuccess: (r) => {
      if (r.created > 0) {
        toast.success(t.toasts.ranDue(r.created));
        refresh(true);
      }
    },
  });
  useEffect(() => {
    if (ran.current || !enabled) return;
    ran.current = true;
    mutate();
  }, [mutate, enabled]);
}
