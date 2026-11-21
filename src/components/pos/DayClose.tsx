import { useId, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { cashCountResult, parseMoneyInput } from "../../../api/lib/ventas";
import { PosSheet } from "./PosSheet";
import { MoneyIn } from "./proto";
import { MENU_TITLE, btn } from "./ui";
import { DEVICE_TZ, moneyC, shortDay } from "./posTypes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: CobrarCopy["pos"];
  methods: Record<string, string>;
  locale: string;
  closeLabel: string;
  retryLabel: string;
  /** The accountant only reads. */
  readOnly: boolean;
};

const ROW = "flex justify-between gap-2.5 rounded-[10px] bg-slate-100 px-3 py-2.5 text-sm";

/** "Cierre del día": today's sales by method, count the drawer, see the difference, save it. */
export function DayClose({ open, onOpenChange, t, methods, locale, closeLabel, retryLabel, readOnly }: Props) {
  const d = t.day;
  const id = useId();
  const utils = trpc.useUtils();
  const [counted, setCounted] = useState("");
  const q = trpc.sales.cashCount.today.useQuery({ timeZone: DEVICE_TZ }, { enabled: open, refetchOnWindowFocus: false });
  const save = trpc.sales.cashCount.save.useMutation({
    onSuccess: () => {
      toast.success(d.saved);
      setCounted("");
      void utils.sales.cashCount.today.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const time = (at: Date | string) => new Date(at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const data = q.data;
  const countC = parseMoneyInput(counted);
  const res = data && countC !== null ? cashCountResult(data.expectedCashCents, countC) : null;
  const resultText = (status: "ok" | "over" | "short", diff: number) => (status === "ok" ? d.result.ok : status === "over" ? d.result.over(moneyC(diff)) : d.result.short(moneyC(-diff)));

  const submit = () => {
    if (countC === null) { toast.error(d.badCount); return; }
    save.mutate({ timeZone: DEVICE_TZ, counted: (countC / 100).toFixed(2) });
  };

  return (
    <PosSheet
      open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setCounted(""); }} title={d.title} closeLabel={closeLabel} focusSheet
      footer={!readOnly && data ? (
        <button type="button" onClick={submit} disabled={save.isPending} className={btn("primary", "w-full")}>
          {save.isPending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{d.closing}</> : data.lastCount ? d.closeAgain : d.close}
        </button>
      ) : undefined}
    >
      {q.isLoading ? (
        <div className="grid gap-1.5" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11 rounded-[10px]" />)}</div>
      ) : q.isError || !data ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <AlertCircle className="h-6 w-6 text-red-600" aria-hidden />
          <p className="text-sm text-slate-700">{d.loadError}</p>
          <button type="button" onClick={() => void q.refetch()} className={btn()}>{retryLabel}</button>
        </div>
      ) : (
        <>
          {/* `.dc-sum` */}
          <div className="grid gap-1.5">
            <div className={ROW}><span>{d.salesToday(data.payments.length)}</span><b className="tabular-nums">{moneyC(data.totals.total)}</b></div>
            <div className={ROW}><span>{d.cash}</span><b className="tabular-nums">{moneyC(data.totals.cash)}</b></div>
            {data.totals.zelle !== 0 && <div className={ROW}><span>{d.zelle}</span><b className="tabular-nums">{moneyC(data.totals.zelle)}</b></div>}
            <div className={ROW}><span>{d.card}</span><b className="tabular-nums">{moneyC(data.totals.card)}</b></div>
            {data.refunds.some((r) => r.method === "cash") && (
              <div className={ROW}><span>{d.refunds}</span><b className="tabular-nums">{moneyC(-data.refunds.filter((r) => r.method === "cash").reduce((s, r) => s + r.cents, 0))}</b></div>
            )}
          </div>

          {data.payments.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">{d.none}</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {data.payments.map((p) => (
                <li key={p.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-slate-100 px-3 py-[11px]">
                  <Check className="h-[18px] w-[18px] text-emerald-600" aria-hidden />
                  <div className="min-w-0">
                    <b className="block truncate text-sm font-[650] text-slate-900">{p.customerName || d.counter}</b>
                    <span className="block text-xs text-slate-500">{time(p.at)} · {methods[p.method] ?? p.method}{p.invoice ? ` · ${d.invoicePay}` : ""}</span>
                  </div>
                  <span className="font-bold tabular-nums text-slate-900">{moneyC(p.cents)}</span>
                </li>
              ))}
            </ul>
          )}

          {data.lastCount && (
            <p className="mt-3 flex items-start gap-2 text-[13px] text-slate-600">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" aria-hidden />
              <span>{d.lastToday(time(data.lastCount.at), data.lastCount.countedByName)} {d.historyRow(moneyC(data.lastCount.countedCents), resultText(data.lastCount.status, data.lastCount.differenceCents))}.</span>
            </p>
          )}

          {readOnly ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-200">{d.readOnly}</p>
          ) : (
            <>
              {/* `.dc-count` */}
              <label htmlFor={`${id}-count`} className="mt-3.5 grid gap-1.5 text-[13px] font-semibold text-slate-900">{d.count}</label>
              <MoneyIn id={`${id}-count`} value={counted} onChange={setCounted} placeholder="0.00" className="mt-1.5 max-w-[160px]" onEnter={submit} />
              <div aria-live="polite">
                {res && (
                  <div className={cn("mt-2.5 rounded-[10px] px-3 py-2.5 text-[13px]", res.status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-slate-900")}>
                    {res.status === "ok"
                      ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" aria-hidden />{d.ok}</span>
                      : <span>{res.status === "over" ? d.over : d.short} <b className="tabular-nums">{moneyC(Math.abs(res.differenceCents))}</b>. {d.diffTail}</span>}
                  </div>
                )}
              </div>
              <p className="mb-1 mt-2 text-xs text-slate-500">{d.countHint} {d.expected(moneyC(data.expectedCashCents))}</p>
            </>
          )}

          {data.history.filter((h) => h.id !== data.lastCount?.id).length > 0 && (
            <>
              <p className={MENU_TITLE}>{d.history}</p>
              <ul className="grid gap-1 text-[13px] text-slate-600">
                {data.history.filter((h) => h.id !== data.lastCount?.id).slice(0, 5).map((h) => (
                  <li key={h.id} className="flex justify-between gap-2">
                    <span>{shortDay(h.day, locale, data.day)} · {time(h.at)}</span>
                    <span className={cn("text-right", h.status === "ok" ? "text-emerald-700" : "text-amber-700")}>{d.historyRow(moneyC(h.countedCents), resultText(h.status, h.differenceCents))}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </PosSheet>
  );
}
