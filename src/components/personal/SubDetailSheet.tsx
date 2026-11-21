import { useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { BankLogo } from "@/components/brand/BankLogo";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { personalPagesCopy } from "@/i18n/copy/personalPages";
import { money } from "./personalUtils";
import { institutionOf, type Institution } from "./txKit";
import { linkBtn, pbtnPrimary, pbtnSm, pbtnSmPrimary } from "./planKit";
import { daysFrom, shortDay, type Today } from "./planDates";

export type SubItem = inferRouterOutputs<AppRouter>["subs"]["list"]["items"][number];

const fmt = (n: number) => money(n, true);

/**
 * The prototype's subscription panel (subPanel): logo, price, next charge, the yearly cost spread per month,
 * the account it's charged to, the latest charges (with price rises), and how to cancel it: the service's
 * own cancel page, Apple or Google Play subscriptions, or step by step. "Ya la cancelé" leaves it waiting
 * for confirmation until its next charge date; "Sigo con ella" / "Volver a agregarla" bring it back.
 * Nothing is simulated: we never sign in anywhere, the person cancels and the bank movements confirm it.
 */
export function SubDetailSheet({ item, today, institutions, onClose, onChanged }: {
  item: SubItem;
  today: Today;
  institutions: readonly Institution[] | undefined;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useCopy(personalPagesCopy).subs.p;
  const d = t.detail;
  const locale = intlLocale(useLang().lang);
  const [step, setStep] = useState<"asked" | "help" | null>(null);
  const setStatus = trpc.subs.setStatus.useMutation({ onError: (e) => toast.error(e.message) });

  const day = (s: string) => shortDay(s, locale, today.y);
  const rel = (s: string) => t.inDays(daysFrom(today, s));
  const per = t.per[item.freq];
  const rt = item.cancel;
  const site = rt.url ? new URL(rt.url).hostname.replace(/^www\./, "") : "";
  const where = rt.kind === "apple" ? d.whereApple : rt.kind === "google" ? d.whereGoogle : site;
  const inst = institutionOf(institutions, item.accountId);
  const base = { key: item.key, name: item.name, today: today.key };
  const undo = (fn: () => void) => ({ action: { label: t.toast.undo, onClick: fn } });

  const markCancelled = () => {
    const expectedOn = item.next;
    setStatus.mutate({ ...base, status: "pending", expectedOn, amount: item.amount, freq: item.freq }, {
      onSuccess: () => {
        setStep(null); onChanged();
        toast.success(t.toast.pending(day(expectedOn), item.name), undo(() => setStatus.mutate({ ...base, status: "on" }, { onSuccess: onChanged })));
      },
    });
  };
  const keep = () => {
    const was = item.status;
    setStatus.mutate({ ...base, status: "on" }, {
      onSuccess: () => {
        onChanged();
        toast.success(t.toast.back(item.name), undo(() => setStatus.mutate({ ...base, status: "pending", expectedOn: item.expectedOn ?? item.next, amount: item.amount, freq: item.freq }, { onSuccess: onChanged })));
        if (was === "cancelled") onClose();
      },
    });
  };
  const notSub = () => {
    setStatus.mutate({ ...base, status: "removed" }, {
      onSuccess: () => { onChanged(); onClose(); toast.success(t.toast.removed(item.name), undo(() => setStatus.mutate({ ...base, status: "on" }, { onSuccess: onChanged }))); },
    });
  };

  const hist = [...item.history].reverse();
  let body;
  if (item.status === "pending") {
    const date = day(item.expectedOn ?? item.next);
    body = (
      <>
        <p className="mt-3.5 flex items-start gap-2.5 rounded-[10px] bg-blue-50 px-3 py-2.5 text-sm text-slate-800">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
          <span><b>{d.pendingTitle}</b>{item.manual ? d.pendingManual(date) : d.pendingText(date)}</span>
        </p>
        <div className="mt-2.5"><button type="button" onClick={keep} disabled={setStatus.isPending} className={pbtnSm}>{d.keep}</button></div>
      </>
    );
  } else if (item.status === "cancelled") {
    const date = day(item.confirmedOn ?? item.expectedOn ?? item.cancelledOn ?? today.key);
    body = (
      <div className="mt-3.5 flex flex-wrap items-start gap-2.5 rounded-[10px] bg-emerald-50 px-3 py-2.5 text-sm text-slate-800">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
        <span className="min-w-0 flex-1"><b>{d.cancelledTitle}</b>{item.expectedOn ? d.cancelledText(day(item.expectedOn)) : ` ${t.metaCancelledOn(date)}.`}</span>
        <button type="button" onClick={keep} disabled={setStatus.isPending} className={pbtnSm}>{d.readd}</button>
      </div>
    );
  } else {
    let inner;
    if (step === "asked") {
      inner = (
        <>
          <b>{d.askedTitle}</b>
          <span>{d.askedText(where)}</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" onClick={markCancelled} disabled={setStatus.isPending} className={pbtnSmPrimary}>{d.yes}</button>
            <button type="button" onClick={() => setStep("help")} className={pbtnSm}>{d.no}</button>
            <button type="button" onClick={() => { setStep(null); onClose(); toast(d.laterToast); }} className={pbtnSm}>{d.later}</button>
          </div>
        </>
      );
    } else if (step === "help") {
      inner = (
        <>
          <b>{d.stepsTitle}</b>
          <ol className="grid list-decimal gap-1 pl-5 text-sm">{d.steps(item.name).map((s) => <li key={s}>{s}</li>)}</ol>
          {/fitness|gym|gimnasio|ymca|peloton/i.test(item.name) && <span className="text-[13px] text-slate-500">{d.gym}</span>}
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" onClick={markCancelled} disabled={setStatus.isPending} className={pbtnSmPrimary}>{d.done}</button>
            <a href={`https://www.google.com/search?q=${encodeURIComponent(d.searchQuery(item.name))}`} target="_blank" rel="noopener noreferrer" className={pbtnSm}>
              <Search className="h-[15px] w-[15px]" aria-hidden="true" />{d.search(item.name)}<span className="sr-only">{d.newTab}</span>
            </a>
          </div>
        </>
      );
    } else {
      const text = rt.kind === "web" ? d.web(item.name, site) : rt.kind === "apple" ? (item.key === "app-store" ? d.appleStore : d.apple) : rt.kind === "google" ? d.google : d.none(item.name);
      inner = (
        <>
          {item.failed && <span className="text-[13px] text-red-600">{d.failedBefore(item.name)}</span>}
          <span>{text}</span>
          {item.freq === "year" && <span>{d.yearly(day(item.next), fmt(item.amount))}</span>}
          <div className="mt-1.5">
            {rt.url ? (
              <a href={rt.url} target="_blank" rel="noopener noreferrer" onClick={() => setStep("asked")} className={pbtnPrimary}>
                {d.cancelBtn}<ExternalLink className="h-4 w-4" aria-hidden="true" /><span className="sr-only">{d.newTab}</span>
              </a>
            ) : (
              <button type="button" onClick={() => setStep("help")} className={pbtnPrimary}>{d.cancelBtn}</button>
            )}
          </div>
          <small className="text-xs text-slate-500">{d.worksUntil(day(item.next))}</small>
        </>
      );
    }
    body = <div className="mt-3.5 grid gap-1.5 rounded-xl border border-slate-200 p-3.5 text-sm text-slate-900" aria-live="polite">{inner}</div>;
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-white p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-200 px-5 py-4">
          <SheetTitle className="text-base font-bold text-slate-900">{d.title}</SheetTitle>
          <SheetDescription className="sr-only">{item.name}</SheetDescription>
        </SheetHeader>
        <div className="px-5 py-5">
          <div className="flex items-center gap-3">
            <MerchantLogo name={item.name} logoUrl={item.logoUrl} size={46} />
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[17px] text-slate-900">{item.name}</b>
              <span className="block text-[13px] text-slate-500">{t.freq[item.freq]}{item.since ? ` · ${t.since(new Date(`${item.since}T12:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" }))}` : ""}</span>
            </div>
            <span className="shrink-0 text-xl font-extrabold tabular-nums text-slate-900">{fmt(item.amount)}<span className="ml-px text-xs font-semibold text-slate-500">{per}</span></span>
          </div>

          <dl className="mt-3.5 divide-y divide-slate-200 rounded-xl border border-slate-200 text-sm">
            {item.status === "on" && (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5"><dt className="text-slate-500">{d.next}</dt><dd className="text-right font-medium text-slate-900">{d.nextVal(day(item.next), rel(item.next))}</dd></div>
            )}
            {item.freq !== "month" && (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5"><dt className="text-slate-500">{d.perMonth}</dt><dd className="text-right font-medium tabular-nums text-slate-900">{d.perMonthVal(fmt(item.perMonth), fmt(item.perYear))}</dd></div>
            )}
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="shrink-0 text-slate-500">{d.chargedIn}</dt>
              <dd className="flex min-w-0 items-center gap-1.5 text-right font-medium text-slate-900">
                {item.manual ? d.manual : (
                  <>{item.accountName && <BankLogo name={inst?.name ?? item.accountName} logo={inst?.logo} color={inst?.color} size={18} />}<span className="truncate">{item.accountName ?? d.unknownAcct}</span></>
                )}
                {item.via === "apple" ? d.viaApple : item.via === "google" ? d.viaGoogle : ""}
              </dd>
            </div>
            {item.raised && (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5"><dt className="text-slate-500">{d.price}</dt><dd className="text-right font-medium text-slate-900">{d.priceRaised(fmt(item.raised.from), fmt(item.raised.to))}</dd></div>
            )}
          </dl>

          <h3 className="mt-4 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{d.last}</h3>
          {item.manual || hist.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">{d.manualHist}</p>
          ) : (
            <ul className="mt-1">
              {hist.map((h, i) => {
                const prev = hist[i + 1];
                const up = prev && h.amount > prev.amount + 0.004;
                return (
                  <li key={`${h.date}-${i}`} className="flex justify-between gap-2.5 border-t border-slate-200 py-[7px] text-sm first:border-t-0">
                    <span className="text-slate-700">{shortDay(h.date, locale, 0)}</span>
                    <span className="tabular-nums text-slate-900">{fmt(h.amount)}{up && <span className="ml-1.5 text-amber-700">{d.rose(fmt(h.amount - prev.amount))}</span>}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {body}

          <div className="mt-4">
            <button type="button" onClick={notSub} disabled={setStatus.isPending} className={cn(linkBtn, "text-slate-600")}>{item.manual ? d.removeManual : d.notSub}</button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
