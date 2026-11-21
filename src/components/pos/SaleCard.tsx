import { forwardRef, useId, type ReactNode } from "react";
import { ChevronDown, Minus, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CobrarCopy } from "@/i18n/copy/cobrar";
import { CARD, CARD_TITLE, FOCUS, LINK_BTN } from "./ui";
import { MoneyIn } from "./proto";
import { moneyC, type CartItem } from "./posTypes";

type Props = {
  t: CobrarCopy["pos"];
  cart: CartItem[];
  /** "Mostrador" or the client's name. */
  clientLabel: string;
  onPickClient: () => void;
  onQty: (id: string, delta: number) => void;
  onEditPrice: (item: CartItem) => void;
  discountOpen: boolean;
  onOpenDiscount: () => void;
  discount: string;
  onDiscount: (v: string) => void;
  discountType: "fixed" | "percentage";
  onDiscountType: (v: "fixed" | "percentage") => void;
  subtotalC: number;
  discountC: number;
  totalC: number;
  /** The "cómo te pagan" control and its panel. */
  children?: ReactNode;
};

const qbtn = `grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-base font-semibold text-slate-900 transition hover:border-blue-600 hover:bg-blue-50 sm:h-[30px] sm:w-[30px] ${FOCUS}`;

/** The prototype's "Venta actual" card (`.card.cart`): client, lines with − n +, discount, `.pos-tot`, how they pay. */
export const SaleCard = forwardRef<HTMLElement, Props>(function SaleCard(p, ref) {
  const { t } = p;
  const id = useId();
  return (
    <section ref={ref} id="pos-sale" className={cn(CARD, "scroll-mt-4")} aria-labelledby={`${id}-t`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={`${id}-t`} className={CARD_TITLE}>{t.cart.title}</h2>
        <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-500">
          <UserRound className="h-[15px] w-[15px] flex-none" aria-hidden />
          <button
            type="button" onClick={p.onPickClient} aria-label={`${t.cart.client}: ${p.clientLabel}`}
            className={`inline-flex min-h-11 max-w-[170px] items-center gap-2 rounded-[9px] border border-slate-200 bg-white px-2 text-[13px] font-semibold text-slate-900 hover:border-slate-300 sm:min-h-[34px] ${FOCUS}`}
          >
            <span className="min-w-0 flex-1 truncate text-left">{p.clientLabel}</span>
            <ChevronDown className="h-4 w-4 flex-none text-slate-900" aria-hidden />
          </button>
        </span>
      </div>

      {p.cart.length === 0 ? (
        <p className="py-2.5 text-sm text-slate-500">{t.cart.empty}</p>
      ) : (
        <ul aria-label={t.cart.title}>
          {p.cart.map((item) => (
            <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 border-t border-slate-200 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_84px]">
              <span className="min-w-0 text-slate-900 [overflow-wrap:anywhere]">{item.name}</span>
              <span className="inline-flex items-center gap-2">
                <button type="button" onClick={() => p.onQty(item.id, -1)} aria-label={t.cart.less(item.name)} className={qbtn}><Minus className="h-3.5 w-3.5" aria-hidden /></button>
                <b className="min-w-[1ch] text-center tabular-nums" aria-live="polite" aria-label={t.cart.qty(item.name, item.quantity)}>{item.quantity}</b>
                <button type="button" onClick={() => p.onQty(item.id, 1)} aria-label={t.cart.more(item.name)} className={qbtn}><Plus className="h-3.5 w-3.5" aria-hidden /></button>
              </span>
              <button
                type="button" onClick={() => p.onEditPrice(item)} aria-label={t.cart.changePrice(item.name)} title={t.cart.changePrice(item.name)}
                className={`-mr-1 min-h-11 rounded-md px-1 text-right tabular-nums text-slate-900 underline-offset-2 hover:underline sm:min-h-0 ${FOCUS}`}
              >
                {moneyC(Math.round(item.price * 100) * item.quantity)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {p.cart.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pb-1 pt-2.5">
          {p.discountOpen ? (
            <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-900">
              <label htmlFor={`${id}-disc`}>{t.cart.discount}</label>
              <div role="radiogroup" aria-label={t.cart.discountIn} className="flex rounded-[9px] bg-slate-100 p-0.5">
                {(["fixed", "percentage"] as const).map((k) => (
                  <button
                    key={k} type="button" role="radio" aria-checked={p.discountType === k} aria-label={k === "fixed" ? t.cart.dollars : t.cart.percent}
                    onClick={() => p.onDiscountType(k)}
                    className={cn(`h-10 w-10 rounded-[7px] text-sm font-semibold sm:h-8 sm:w-8 ${FOCUS}`, p.discountType === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                  >
                    {k === "fixed" ? "$" : "%"}
                  </button>
                ))}
              </div>
              {p.discountType === "fixed" ? (
                <MoneyIn id={`${id}-disc`} value={p.discount} onChange={p.onDiscount} placeholder="0.00" className="max-w-[120px]" autoFocus />
              ) : (
                <span className="relative block w-full max-w-[100px]">
                  <input
                    id={`${id}-disc`} inputMode="decimal" autoComplete="off" value={p.discount} placeholder="0" autoFocus
                    onChange={(e) => p.onDiscount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="min-h-11 w-full rounded-[10px] border border-slate-200 bg-white py-1.5 pl-3 pr-7 text-base font-semibold tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none focus:shadow-[0_0_0_3px_#EFF6FF] sm:min-h-9 sm:text-[15px]"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-semibold text-slate-500" aria-hidden>%</span>
                </span>
              )}
            </div>
          ) : (
            <button type="button" onClick={p.onOpenDiscount} className={LINK_BTN}>{t.cart.addDiscount}</button>
          )}
        </div>
      )}

      {/* `.pos-tot` */}
      <dl className="mt-2 grid gap-1 rounded-[10px] bg-slate-100 p-3 text-sm">
        {p.discountC > 0 && (
          <>
            <div className="flex justify-between"><dt>{t.cart.subtotal}</dt><dd className="tabular-nums">{moneyC(p.subtotalC)}</dd></div>
            <div className="flex justify-between"><dt>{t.cart.discount}</dt><dd className="tabular-nums">{moneyC(-p.discountC)}</dd></div>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <dt>{t.cart.total}</dt>
          <dd className="text-[22px] font-bold tabular-nums text-slate-900">{moneyC(p.totalC)}</dd>
        </div>
      </dl>

      {p.children}
    </section>
  );
});
