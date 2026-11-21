import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ClipboardList, Lock, Repeat } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCopy } from "@/i18n/useI18n";
import { quotesCopy } from "@/i18n/copy/quotes";
import { QuotesTab } from "@/components/quotes/QuotesTab";
import { RecurringTab } from "@/components/quotes/RecurringTab";
import { Receivables } from "@/components/quotes/Receivables";
import { toCompanyInfo, toCustomerOptions, toServiceOptions, useRefreshQuotes } from "@/components/quotes/shared";

type Tab = "quotes" | "recurring";

// Cotizaciones y facturas recurrentes (business Pro and Negocio).
export default function Quotes() {
  const t = useCopy(quotesCopy);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "recurring" ? "recurring" : "quotes";

  const plan = trpc.subscription.planInfo.useQuery(undefined, { staleTime: 5 * 60_000 });
  const planLacks = plan.data ? !plan.data.features.includes("quotes") : false;
  const ready = !!plan.data && !planLacks;
  const receivables = trpc.quotes.receivables.useQuery(undefined, {
    enabled: ready,
    retry: (count, err) => err.data?.code !== "FORBIDDEN" && count < 1,
  });
  const forbidden = receivables.error?.data?.code === "FORBIDDEN";

  if (planLacks || forbidden) {
    return (
      <AnimatedPage className="p-4 lg:p-6">
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100"><Lock className="h-5 w-5 text-neutral-500" aria-hidden="true" /></span>
          <h1 className="mt-4 text-lg font-semibold text-black">{t.locked.title}</h1>
          {/* With the plan but still refused (e.g. a team member's access): the server says why. */}
          <p className="mt-2 text-sm text-neutral-600">{planLacks ? t.locked.text : receivables.error?.message || t.locked.text}</p>
          {planLacks && (
            <Button className="mt-5 w-full bg-black text-white hover:bg-neutral-800" onClick={() => navigate("/settings")}>{t.locked.cta}</Button>
          )}
        </div>
      </AnimatedPage>
    );
  }

  return (
    <AnimatedPage className="p-4 lg:p-6">
      <div className="mb-5 min-w-0">
        <h1 className="text-lg font-semibold text-black">{t.title}</h1>
        <p className="text-xs text-neutral-500">{t.subtitle}</p>
      </div>

      {!ready ? (
        <div className="space-y-3" role="status" aria-label={t.loading}>
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : (
        <QuotesWorkspace
          tab={tab}
          onTab={(v) => setParams(v === "recurring" ? { tab: "recurring" } : {}, { replace: true })}
          receivables={receivables.data ?? []}
        />
      )}
    </AnimatedPage>
  );
}

function QuotesWorkspace({ tab, onTab, receivables }: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  receivables: Parameters<typeof Receivables>[0]["items"];
}) {
  const t = useCopy(quotesCopy);
  const services = trpc.services.list.useQuery(undefined, { staleTime: 60_000 });
  const customers = trpc.customers.list.useQuery({ type: "all", limit: 200 }, { staleTime: 60_000 });
  const settings = trpc.settings.get.useQuery(undefined, { staleTime: 5 * 60_000 });
  const serviceOptions = useMemo(() => toServiceOptions(services.data), [services.data]);
  const customerOptions = useMemo(() => toCustomerOptions(customers.data), [customers.data]);
  const company = useMemo(() => toCompanyInfo(settings.data), [settings.data]);
  useRunDueOnce();

  return (
    <div className="space-y-5">
      <Receivables items={receivables} />
      <Tabs value={tab} onValueChange={(v) => onTab(v === "recurring" ? "recurring" : "quotes")} className="gap-4">
        <TabsList aria-label={t.tabs.label} className="h-10 w-full sm:w-auto">
          <TabsTrigger value="quotes" className="px-4">
            <ClipboardList aria-hidden="true" /> {t.tabs.quotes}
          </TabsTrigger>
          <TabsTrigger value="recurring" className="px-4">
            <Repeat aria-hidden="true" /> {t.tabs.recurring}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="quotes">
          <QuotesTab services={serviceOptions} customers={customerOptions} company={company} />
        </TabsContent>
        <TabsContent value="recurring">
          <RecurringTab services={serviceOptions} customers={customerOptions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Creates the recurring sales that are due when the page opens (the server timer does it too;
 * running twice is harmless). Says so only when something was created.
 */
function useRunDueOnce() {
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
    if (ran.current) return;
    ran.current = true;
    mutate();
  }, [mutate]);
}
