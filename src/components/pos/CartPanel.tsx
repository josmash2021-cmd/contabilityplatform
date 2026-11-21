import { useId } from "react";
import { Link } from "react-router";
import { AlertTriangle, Banknote, Check, CreditCard, Loader2, Minus, Pencil, Plus, ShoppingBag, Smartphone, Trash2, UserRound, X, type LucideIcon } from "lucide-react";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { money, type CartItem, type PayMethod } from "./posTypes";

const METHODS: { id: PayMethod; icon: LucideIcon }[] = [
  { id: "cash", icon: Banknote },
  { id: "zelle", icon: Smartphone },
  { id: "card", icon: CreditCard },
];

export type CartProps = {
  cart: CartItem[];
  onQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onEditPrice: (item: CartItem) => void;
  client?: { id: number; name: string };
  onPickClient: () => void;
  onClearClient: () => void;
  discount: string;
  onDiscount: (v: string) => void;
  discountType: "fixed" | "percentage";
  onDiscountType: (v: "fixed" | "percentage") => void;
  subtotal: number;
  discountAmt: number;
  total: number;
  payment: PayMethod;
  onPayment: (m: PayMethod) => void;
  zelleEmail: string | null;
  /** The owner can open Ajustes; an employee can't. */
  canManage: boolean;
  methods: Record<string, string>;
  t: CobrarCopy["pos"];
};

/** Nothing in the sale yet. */
export function CartEmpty({ t }: { t: CobrarCopy["pos"] }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-slate-50 px-4 py-8 text-center">
      <ShoppingBag className="h-6 w-6 text-slate-400" aria-hidden />
      <p className="text-sm text-slate-500">{t.cart.empty}</p>
    </div>
  );
}

/** The whole sale in one column (the phone sheet). */
export function CartBody(p: CartProps) {
  if (p.cart.length === 0) return <CartEmpty t={p.t} />;
  return <div className="space-y-4"><CartLines {...p} /><CartSummary {...p} /></div>;
}

/** Who it's for and what's in it. */
export function CartLines(p: CartProps) {
  const { cart, t } = p;
  return (
    <div className="space-y-3">
      {/* Client (optional) */}
      {p.client ? (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 py-1.5 pl-3 pr-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700" aria-hidden>{p.client.name.charAt(0).toUpperCase()}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium text-slate-500">{t.cart.client}</span>
            <span className="block truncate text-sm font-semibold text-slate-900">{p.client.name}</span>
          </span>
          <button onClick={p.onPickClient} className="inline-flex h-11 items-center rounded-lg px-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 lg:h-9">{t.cart.changeClient}</button>
          <button onClick={p.onClearClient} aria-label={t.cart.removeClient} className="grid h-11 w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:h-9 lg:w-9"><X className="h-4 w-4" aria-hidden /></button>
        </div>
      ) : (
        <button onClick={p.onPickClient} className="flex h-12 w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 px-3 text-left text-sm text-slate-600 transition hover:border-blue-400 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <UserRound className="h-5 w-5 text-slate-400" aria-hidden />
          <span className="font-medium text-slate-800">{t.cart.addClient}</span>
          <span className="text-slate-400">({t.cart.optional})</span>
        </button>
      )}

      {/* Lines */}
      <ul className="divide-y divide-slate-100" aria-label={t.cart.title}>
        {cart.map((item) => (
          <li key={item.id} className="py-3 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">{item.name}</p>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{money(item.price * item.quantity)}</p>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <button
                onClick={() => p.onEditPrice(item)}
                aria-label={t.cart.changePrice(item.name)}
                className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:h-8"
              >
                <span className="tabular-nums">{t.cart.each(money(item.price))}</span><Pencil className="h-3 w-3" aria-hidden />
              </button>
              <div className="flex items-center gap-1">
                <button onClick={() => p.onQty(item.id, -1)} aria-label={t.cart.less(item.name)} className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95 lg:h-9 lg:w-9"><Minus className="h-4 w-4" aria-hidden /></button>
                <span className="w-8 text-center text-base font-semibold tabular-nums text-slate-900" aria-live="polite" aria-label={t.cart.qty(item.name, item.quantity)}>{item.quantity}</span>
                <button onClick={() => p.onQty(item.id, 1)} aria-label={t.cart.more(item.name)} className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50 active:scale-95 lg:h-9 lg:w-9"><Plus className="h-4 w-4" aria-hidden /></button>
                <button onClick={() => p.onRemove(item.id)} aria-label={t.cart.remove(item.name)} className="ml-1 grid h-11 w-11 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 lg:h-9 lg:w-9"><Trash2 className="h-4 w-4" aria-hidden /></button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Discount, the total and how they pay. */
export function CartSummary(p: CartProps) {
  const { t } = p;
  const ids = useId();
  return (
    <div className="space-y-4">
      {/* Discount */}
      <div className="rounded-xl bg-slate-50 p-3 lg:px-3 lg:py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor={`${ids}-disc`} className="block text-sm font-medium text-slate-700">{t.cart.discount}</label>
            {p.discountType === "percentage" && p.discountAmt > 0 && (
              <p className="text-xs tabular-nums text-slate-500">{t.cart.equals(money(-p.discountAmt))}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div role="radiogroup" aria-label={t.cart.discountIn} className="flex rounded-[10px] bg-slate-200/70 p-0.5">
              {(["fixed", "percentage"] as const).map((k) => (
                <button
                  key={k} role="radio" aria-checked={p.discountType === k} aria-label={k === "fixed" ? t.cart.dollars : t.cart.percent}
                  onClick={() => p.onDiscountType(k)}
                  className={`h-10 w-10 rounded-lg text-sm font-semibold transition ${p.discountType === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {k === "fixed" ? "$" : "%"}
                </button>
              ))}
            </div>
            <input
              id={`${ids}-disc`} type="number" inputMode="decimal" min="0"
              step={p.discountType === "percentage" ? "1" : "0.01"} max={p.discountType === "percentage" ? "100" : undefined}
              value={p.discount} onChange={(e) => p.onDiscount(e.target.value)} onFocus={(e) => e.target.select()}
              className="h-10 w-24 rounded-[10px] border border-slate-200 bg-white px-3 text-right text-base tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 sm:text-sm"
            />
          </div>
        </div>
      </div>

      {/* Totals */}
      <dl className="space-y-1 text-sm">
        {p.discountAmt > 0 && (
          <>
            <div className="flex justify-between"><dt className="text-slate-500">{t.cart.subtotal}</dt><dd className="tabular-nums text-slate-900">{money(p.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">{t.cart.discount}</dt><dd className="tabular-nums text-slate-900">{money(-p.discountAmt)}</dd></div>
          </>
        )}
        <div className={`flex items-end justify-between gap-3 ${p.discountAmt > 0 ? "border-t border-slate-200 pt-3" : ""}`}>
          <dt className="pb-1 text-sm font-semibold text-slate-900">{t.cart.total}</dt>
          <dd className="text-4xl font-bold tabular-nums tracking-tight text-slate-900">{money(p.total)}</dd>
        </div>
      </dl>

      {/* How they pay */}
      <div>
        <p id={`${ids}-pay`} className="text-sm font-semibold text-slate-900">{t.cart.howPays}</p>
        <div role="radiogroup" aria-labelledby={`${ids}-pay`} className="mt-2 grid grid-cols-3 gap-2">
          {METHODS.map(({ id, icon: Icon }) => {
            const on = p.payment === id;
            return (
              <button
                key={id} role="radio" aria-checked={on} onClick={() => p.onPayment(id)}
                className={`relative flex h-[72px] flex-col items-center justify-center gap-1 rounded-xl border-2 text-sm font-semibold transition lg:h-12 lg:flex-row lg:gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                  on ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                {on && <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5" aria-hidden />}
                <Icon className="h-6 w-6 lg:h-5 lg:w-5" aria-hidden />
                {p.methods[id]}
              </button>
            );
          })}
        </div>
        {p.payment === "zelle" && (p.zelleEmail ? (
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-center lg:py-2">
            <p className="text-xs text-slate-600">{t.pay.zelleAsk}</p>
            <p className="mt-1 break-all text-base font-semibold text-slate-900">{p.zelleEmail}</p>
            <p className="mt-1 text-xs text-slate-500">{t.pay.zelleHint}</p>
          </div>
        ) : (
          <div className="mt-3 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <p>
              {t.pay.zelleMissing}{" "}
              {p.canManage ? <Link to="/settings" className="font-semibold underline underline-offset-2">{t.pay.zelleSetup}</Link> : t.pay.zelleAskOwner}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The big button that records the sale. */
export function ChargeButton({ total, payment, disabled, pending, onCharge, t }: {
  total: number; payment: PayMethod; disabled: boolean; pending: boolean; onCharge: () => void; t: CobrarCopy["pos"];
}) {
  const label = t.pay[payment](money(total));
  return (
    <button
      onClick={onCharge}
      disabled={disabled || pending}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm transition hover:bg-blue-500 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
    >
      {pending ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{t.pay.charging}</> : <><Check className="h-5 w-5" aria-hidden /><span className="tabular-nums">{label}</span></>}
    </button>
  );
}
