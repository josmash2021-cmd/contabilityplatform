import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams } from "react-router";
import { useSubscriptionAgent } from "@/hooks/useSubscriptionAgent";
import { toast } from "sonner";
import { useCopy, useLang } from "@/i18n/useI18n";
import { appCopy } from "@/i18n/copy/app";
import { billingCopy } from "@/i18n/copy/billing";
import { marketingCopy } from "@/i18n/copy/marketing";
import { PlanPicker } from "@/components/billing/PlanPicker";
import { Skeleton } from "@/components/ui/skeleton";
import { findPlan } from "@/components/marketing/content";
import { intlLocale } from "@/i18n/lang";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw, Zap } from "lucide-react";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1";
const BTN_SM = `inline-flex min-h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-slate-200 bg-white px-[11px] py-1.5 text-[13px] font-semibold text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 ${FOCUS}`;
const BTN_SM_PRIMARY = `inline-flex min-h-[34px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-blue-600 bg-blue-600 px-[11px] py-1.5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60 ${FOCUS}`;
const SET_SUB = "mb-0.5 mt-4 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500";

/** The prototype's status dot + label (.dst). */
function Dst({ tone, children }: { tone: "good" | "open" | "warn"; children: React.ReactNode }) {
  const color = { good: "text-emerald-600", open: "text-blue-600", warn: "text-amber-700" }[tone];
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold", color)}><i className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden />{children}</span>;
}

/**
 * Ajustes › Plan y pagos (2.0 prototype). Stripe does the work: checkout for a new plan, the billing
 * portal for the card, cancel / resume, and the monthly → annual upgrade. Payments come from Stripe's webhooks.
 */
export default function SubscriptionSettings() {
  const appT = useCopy(appCopy);
  const t = useCopy(billingCopy);
  const s = t.subscription;
  const v = t.planView;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const { user } = useAuth();
  const isPersonal = user?.modePreference === "personal";
  const mode = isPersonal ? "personal" : "business";
  const pricing = useCopy(marketingCopy).pricing;
  const { data: tierData } = trpc.subscription.currentTier.useQuery();
  // Before tiers, everyone paid the $80 / $40 plan, which is Pro now.
  const tierPlan = findPlan(mode, tierData?.tier) ?? findPlan(mode, "pro")!;
  const tierCopy = pricing.plans[tierPlan.key];

  const utils = trpc.useUtils();
  const [searchParams] = useSearchParams();
  const renewParam = searchParams.get("renew"); // "monthly" or "annual" from overlay

  // Poll every 5 seconds: when someone pays in Stripe and the webhook hasn't arrived yet,
  // the status endpoint looks in Stripe directly and finds the subscription.
  const { data: status, isLoading: statusLoading } = trpc.subscription.status.useQuery(
    undefined,
    { refetchInterval: 5000, refetchIntervalInBackground: true },
  );
  const { data: payments } = trpc.subscription.payments.useQuery();

  // Subscription Recovery Agent — auto-detects lost subs and auto-reverts failed upgrades
  useSubscriptionAgent();

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(false);

  // Coming back from Stripe Checkout after paying the upgrade: complete it.
  const completeUpgradeMut = trpc.subscription.completeUpgrade.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setUpgradeSuccess(true);
        utils.subscription.status.invalidate();
        utils.subscription.payments.invalidate();
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        toast.error(data.error || s.upgradeFailed);
      }
    },
    onError: (err) => toast.error(err.message || s.upgradeError),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") === "success") {
      completeUpgradeMut.mutate();
    } else if (params.get("upgrade") === "cancelled") {
      window.history.replaceState({}, "", window.location.pathname);
      toast.error(s.paymentCancelled);
    }
    // Clean the URL after a Stripe checkout.
    if (params.get("subscription") === "success") window.history.replaceState({}, "", window.location.pathname);
    // Once, on arrival from Stripe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createCheckout = trpc.subscription.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
      else toast.error(s.checkoutFailed);
    },
    onError: (err) => toast.error(err.message || s.checkoutError),
  });

  const cancelMut = trpc.subscription.cancel.useMutation({
    onSuccess: () => {
      utils.subscription.status.invalidate();
      utils.subscription.payments.invalidate();
      setConfirmCancel(false);
      toast.success(s.cancelled);
    },
    onError: (err) => toast.error(err.message),
  });

  const portalMut = trpc.subscription.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
      else toast.error(s.portalFailed);
    },
    onError: (err) => toast.error(err.message || s.portalError),
  });

  // Monthly → annual: Stripe Checkout charges the difference; on return, completeUpgrade applies it.
  const upgradeMut = trpc.subscription.upgrade.useMutation({
    onSuccess: (data) => {
      utils.subscription.status.invalidate();
      utils.subscription.payments.invalidate();
      if (data.success && data.url) {
        window.location.href = data.url;
      } else {
        // The upgrade didn't start, but the monthly subscription is still active.
        toast.error(data.error || s.upgradeFailed, { duration: 5000 });
      }
    },
    onError: (err) => toast.error(err.message + s.monthlyStillActive, { duration: 5000 }),
  });

  const resumeMut = trpc.subscription.resume.useMutation({
    onSuccess: (data) => {
      utils.subscription.status.invalidate();
      utils.subscription.payments.invalidate();
      toast.success(data.message || s.resumed);
    },
    onError: (err) => toast.error(err.message || s.resumeFailed),
  });

  const longDate = (d: string | Date) => new Date(d).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  const shortDate = (d: string | Date) => new Date(d).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const money = (n: number | string) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

  if (statusLoading) {
    return (
      <div className="space-y-3" role="status" aria-label={v.loading}>
        <Skeleton className="h-6 w-40" /><Skeleton className="h-9 w-32" /><Skeleton className="h-4 w-64 max-w-full" /><Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  // Free trial (no paid plan yet): the plans with a trial notice instead of an "active plan" card.
  const freeTrial = status?.status === "trialing" && status.trial?.active ? status.trial : null;

  // ─── PAYING SUBSCRIBER ───
  if (status?.active && !freeTrial) {
    const isMonthly = status.plan === "monthly";
    const price = isMonthly ? tierPlan.monthly : tierPlan.annual;
    const annualDiff = tierPlan.annual - tierPlan.monthly;
    const end = status.currentPeriodEnd ? longDate(status.currentPeriodEnd) : null;
    type Payment = { id: number; amount: string | number; plan: string; status: string; receiptUrl: string | null; paidAt: string | Date | null };
    const list: Payment[] = payments ?? [];

    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[17px] font-bold text-slate-900">{v.title}</h3>
          <Dst tone={status.cancelAtPeriodEnd ? "warn" : "open"}>{v.planName(tierCopy.name)}</Dst>
        </div>

        {upgradeSuccess && (
          <p className="mb-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{s.upgradeSuccess}
          </p>
        )}

        <p className="text-[30px] font-extrabold leading-tight tracking-tight text-slate-900 tabular-nums">
          {money(price)}<span className="text-sm font-medium text-slate-500"> {isMonthly ? v.perMonth : v.perYear}</span>
        </p>
        <p className="mt-0.5 text-[13px] text-slate-500">
          {end ? (status.cancelAtPeriodEnd ? v.ends(end) : v.renews(end)) : null}{end ? " · " : ""}{isMonthly ? v.monthly : v.annual}
        </p>

        {status.cancelAtPeriodEnd && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-[13px] text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{s.cancelNotice}</p>
            <button type="button" onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending} className={`mt-2.5 ${BTN_SM_PRIMARY}`}>
              {resumeMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {resumeMut.isPending ? s.resuming : s.resume}
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => portalMut.mutate()} disabled={portalMut.isPending} className={BTN_SM}>
            {portalMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}{v.changeCard}
          </button>
          {isMonthly && !status.cancelAtPeriodEnd && (
            <button type="button" onClick={() => setShowUpgrade((x) => !x)} aria-expanded={showUpgrade} className={BTN_SM_PRIMARY}>
              <Zap className="h-3.5 w-3.5" />{v.toAnnual}
            </button>
          )}
        </div>

        {showUpgrade && isMonthly && (
          <div className="mt-3 rounded-xl bg-slate-100 p-3.5">
            <p className="text-sm font-semibold text-slate-900">{v.upgradeTitle}</p>
            <p className="mt-1 text-[22px] font-extrabold tabular-nums text-slate-900">{money(tierPlan.annual)}<span className="text-sm font-medium text-slate-500"> {v.perYear}</span></p>
            <p className="text-[13px] font-medium text-emerald-700">{t.plans.savings(money(tierPlan.monthly * 2))}</p>
            <p className="mt-1 text-[13px] text-slate-600">
              {s.upgradeDiff.pre}<strong>{money(annualDiff)}</strong>{s.upgradeDiff.mid}<strong>{money(tierPlan.monthly)}</strong>{s.upgradeDiff.post}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowUpgrade(false)} className={BTN_SM}>{v.back}</button>
              <button type="button" onClick={() => upgradeMut.mutate({ from: "monthly", to: "annual" })} disabled={upgradeMut.isPending} className={BTN_SM_PRIMARY}>
                {upgradeMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{v.upgradeConfirm}
              </button>
            </div>
          </div>
        )}

        {!isMonthly && <p className="mt-3 text-[13px] text-slate-500">{v.annualNote}</p>}

        <p className={SET_SUB}>{v.invoicesTitle}</p>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">{v.noInvoices}</p>
        ) : (
          <ul className="grid gap-2">
            {list.map((p) => {
              const ok = p.status === "succeeded";
              return (
                <li key={p.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-slate-100 px-3 py-[11px]">
                  {ok ? <CheckCircle2 className="h-[18px] w-[18px] text-emerald-600" aria-hidden /> : <AlertTriangle className="h-[18px] w-[18px] text-amber-600" aria-hidden />}
                  <div className="min-w-0">
                    <b className="block text-sm font-semibold text-slate-900">{p.paidAt ? shortDate(p.paidAt) : "—"}</b>
                    <span className="block text-xs text-slate-500">{ok ? v.paid : p.status === "pending" ? v.pending : v.failed} · {p.plan === "monthly" ? v.monthly : v.annual}</span>
                  </div>
                  {p.receiptUrl ? (
                    <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className={BTN_SM} aria-label={v.receipt(money(p.amount))}>
                      <span className="tabular-nums">{money(p.amount)}</span><ExternalLink className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                    </a>
                  ) : <span className="text-sm font-semibold tabular-nums text-slate-900">{money(p.amount)}</span>}
                </li>
              );
            })}
          </ul>
        )}

        {isMonthly && !status.cancelAtPeriodEnd && (
          <div className="mt-3.5">
            {!confirmCancel ? (
              <button type="button" onClick={() => setConfirmCancel(true)} className={`min-h-[34px] text-sm font-semibold text-red-600 underline-offset-2 hover:underline ${FOCUS}`}>{v.cancel}</button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-600/25 bg-red-50 p-3" role="alert">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
                <span className="min-w-0 flex-[1_1_220px] text-[13px] text-slate-800">{v.cancelConfirm}</span>
                <button type="button" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending} className={`${BTN_SM_PRIMARY} border-red-600 bg-red-600`}>
                  {cancelMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{v.cancelYes}
                </button>
                <button type="button" onClick={() => setConfirmCancel(false)} className={BTN_SM}>{v.back}</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── NO PAID PLAN: THE PLANS (same cards as the landing page) ───
  const wasBroken = status?.status === "past_due" || status?.status === "incomplete" || status?.status === "unpaid";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[17px] font-bold text-slate-900">{v.title}</h3>
        {freeTrial && <Dst tone="good">{v.trial}</Dst>}
      </div>
      {freeTrial ? (
        <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-emerald-900">{appT.trial.settingsTitle(freeTrial.daysLeft)}</p>
          <p className="text-[13px] text-emerald-800">{appT.trial.settingsText(new Date(freeTrial.endsAt).toLocaleDateString(locale, { day: "numeric", month: "long" }))}</p>
        </div>
      ) : wasBroken ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-semibold text-amber-900">{s.interruptedTitle}</p>
          <p className="text-[13px] text-amber-800">{s.interruptedText}</p>
        </div>
      ) : (
        <p className="text-[13px] text-slate-500">{s.setupText}</p>
      )}

      <p className={SET_SUB}>{v.choose}</p>
      <div className="mt-2">
        <PlanPicker
          mode={mode}
          initialBilling={renewParam === "annual" ? "annual" : "monthly"}
          pendingTier={createCheckout.isPending ? createCheckout.variables?.tier ?? null : null}
          onPick={(plan, tier) => createCheckout.mutate({ plan, tier })}
        />
      </div>
    </div>
  );
}
