import { useId, useState } from "react";
import { Link } from "react-router";
import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { cashChips, changeDue, parseMoneyInput, splitPayment } from "../../../api/lib/ventas";
import { SEG, btn, segBtn } from "./ui";
import { MoneyIn } from "./proto";
import { money0C, moneyC, type PayView } from "./posTypes";

type Props = {
  t: CobrarCopy["pos"];
  totalC: number;
  view: PayView;
  onView: (v: PayView) => void;
  received: string;
  onReceived: (v: string) => void;
  splitCash: string;
  onSplitCash: (v: string) => void;
  splitRest: "card" | "zelle";
  onSplitRest: (v: "card" | "zelle") => void;
  /** The business's Zelle email or phone (Ajustes); null when missing. */
  zelle: string | null;
  /** The owner can open Ajustes; an employee can't. */
  canManage: boolean;
  disabled: boolean;
  pending: boolean;
  onCharge: () => void;
};

const VIEWS: PayView[] = ["cash", "zelle", "card", "split"];

/** `.pay-seg` (Efectivo / Zelle / Tarjeta / Dividir) and its `.paybox`. */
export function PayPanel(p: Props) {
  const { t } = p;
  const id = useId();
  const [copied, setCopied] = useState(false);
  const pay = t.pay;

  const chargeBtn = (label: string, extraDisabled = false) => (
    <button type="button" onClick={p.onCharge} disabled={p.disabled || p.pending || extraDisabled} className={btn("primary", "big", "w-full")}>
      {p.pending ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{pay.charging}</> : <span className="tabular-nums">{label}</span>}
    </button>
  );

  const copyZelle = async () => {
    if (!p.zelle) return;
    try {
      await navigator.clipboard.writeText(p.zelle);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* the text is on screen anyway */ }
  };

  let panel;
  if (p.view === "cash") {
    const rec = parseMoneyInput(p.received);
    const { changeCents, shortCents } = changeDue(p.totalC, rec);
    panel = (
      <div className="mt-3 grid gap-2.5">
        <label htmlFor={`${id}-rec`} className="grid gap-1 text-[13px] font-semibold text-slate-900">{pay.received}</label>
        <MoneyIn id={`${id}-rec`} value={p.received} onChange={p.onReceived} placeholder={(p.totalC / 100).toFixed(2)} className="-mt-1.5 max-w-[160px]" onEnter={p.onCharge} />
        <div className="flex flex-wrap gap-1.5">
          {cashChips(p.totalC).map((c, k) => (
            <button key={c} type="button" onClick={() => p.onReceived((c / 100).toFixed(2))} className={btn("sm")}>{k === 0 ? pay.exact : money0C(c)}</button>
          ))}
        </div>
        <div className="text-sm" aria-live="polite">
          {rec === null ? <span className="text-slate-500">{pay.exactHint}</span>
            : shortCents > 0 ? <span className="font-semibold text-amber-700">{pay.short(moneyC(shortCents))}</span>
            : <>{pay.change} <b className="text-lg tabular-nums">{moneyC(changeCents)}</b></>}
        </div>
        {chargeBtn(pay.cash(moneyC(p.totalC)))}
      </div>
    );
  } else if (p.view === "zelle") {
    panel = p.zelle ? (
      <div className="mt-3 grid gap-2.5">
        <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-center">
          <p className="text-[13px] text-slate-600">{pay.zelleAsk}</p>
          <p className="mt-1 break-all text-lg font-bold text-slate-900">{p.zelle}</p>
          <button type="button" onClick={copyZelle} className={cn(btn("sm"), "mt-2")}>
            {copied ? <><Check className="h-4 w-4 text-emerald-600" aria-hidden />{pay.zelleCopied}</> : <><Copy className="h-4 w-4" aria-hidden />{pay.zelleCopy}</>}
          </button>
          <p className="mt-2 text-xs text-slate-500">{pay.zelleNoQr}</p>
        </div>
        <p className="text-[13px] text-slate-500">{pay.zelleHint}</p>
        {chargeBtn(pay.zelle(moneyC(p.totalC)))}
      </div>
    ) : (
      <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
        <p>
          {pay.zelleMissing}{" "}
          {p.canManage ? <Link to="/settings?sec=negocio" className="font-semibold underline underline-offset-2">{pay.zelleSetup}</Link> : pay.zelleAskOwner}
        </p>
      </div>
    );
  } else if (p.view === "card") {
    panel = (
      <div className="mt-3 grid gap-2.5">
        <p className="text-[13px] text-slate-500">{pay.cardHint}</p>
        {chargeBtn(pay.card(moneyC(p.totalC)))}
      </div>
    );
  } else {
    const cash = parseMoneyInput(p.splitCash);
    const res = splitPayment(p.totalC, cash, p.splitRest);
    const restC = res.ok ? res.payments[1].cents : Math.max(0, p.totalC - Math.max(0, cash ?? 0));
    panel = (
      <div className="mt-3 grid gap-2.5">
        <label htmlFor={`${id}-split`} className="text-[13px] font-semibold text-slate-900">{pay.splitCash}</label>
        <MoneyIn id={`${id}-split`} value={p.splitCash} onChange={p.onSplitCash} placeholder="0.00" className="-mt-1.5 max-w-[160px]" />
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-900">
          <span id={`${id}-rest`}>{pay.splitRest}</span>
          <div role="radiogroup" aria-labelledby={`${id}-rest`} className={cn(SEG, "grid-cols-2")}>
            {(["card", "zelle"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={p.splitRest === m} onClick={() => p.onSplitRest(m)} className={cn(segBtn(p.splitRest === m), "px-3")}>{pay.seg[m]}</button>
            ))}
          </div>
        </div>
        <div className="text-sm" aria-live="polite">
          {pay.splitRestIs(pay.restWord[p.splitRest])} <b className="text-lg tabular-nums">{moneyC(restC)}</b>
          {!res.ok && cash !== null && cash > 0 && <span className="mt-0.5 block text-[13px] text-amber-700">{pay.splitAllCash}</span>}
        </div>
        {p.splitRest === "zelle" && !p.zelle && (
          <p className="text-[13px] text-amber-800">{pay.zelleMissing} {p.canManage ? <Link to="/settings?sec=negocio" className="font-semibold underline underline-offset-2">{pay.zelleSetup}</Link> : pay.zelleAskOwner}</p>
        )}
        {p.splitRest === "zelle" && p.zelle && <p className="text-[13px] text-slate-500">{pay.zelleAsk} <b className="break-all text-slate-900">{p.zelle}</b></p>}
        {chargeBtn(pay.split(moneyC(p.totalC)), p.splitRest === "zelle" && !p.zelle)}
      </div>
    );
  }

  return (
    <div>
      <div role="radiogroup" aria-label={pay.howPays} className={cn(SEG, "mt-3 w-full grid-cols-4")}>
        {VIEWS.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={p.view === v} onClick={() => p.onView(v)} className={segBtn(p.view === v)}>{pay.seg[v]}</button>
        ))}
      </div>
      {panel}
    </div>
  );
}
