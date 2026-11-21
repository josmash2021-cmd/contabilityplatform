import { useMemo, useState } from "react";
import { Calculator, ChevronUp, Eye } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { cobrarCopy } from "@/i18n/copy/cobrar";
import { ServicePicker } from "@/components/pos/ServicePicker";
import { CartBody, CartEmpty, CartLines, CartSummary, ChargeButton, type CartProps } from "@/components/pos/CartPanel";
import { ClientPicker } from "@/components/pos/ClientPicker";
import { AmountPad } from "@/components/pos/AmountPad";
import { PosSheet } from "@/components/pos/PosSheet";
import { SaleDone, type Company } from "@/components/pos/SaleDone";
import {
  SERVER_CUSTOM_SERVICE, money, norm, num,
  type CartItem, type DoneSale, type PadMode, type PayMethod, type ServiceRow,
} from "@/components/pos/posTypes";

/** Cobrar 2.0: pick what was sold, check the running sale, choose how they pay, charge. */
export default function POS() {
  const copy = useCopy(cobrarCopy);
  const t = copy.pos;
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const utils = trpc.useUtils();

  const services = trpc.services.list.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();
  // Team role (same cached query as the menu): an employee can't open Servicios or Ajustes; the accountant only reads.
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const canManage = !membership;
  const readOnly = membership?.role === "accountant";

  const [cart, setCart] = useState<CartItem[]>([]);
  const [client, setClient] = useState<{ id: number; name: string } | undefined>();
  const [discount, setDiscount] = useState("0");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [payment, setPayment] = useState<PayMethod>("cash");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState(false);
  const [pad, setPad] = useState<PadMode | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [done, setDone] = useState<DoneSale | null>(null);

  const createSale = trpc.sales.create.useMutation({
    onSuccess: () => {
      utils.sales.list.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success(t.saleRecorded);
      setCart([]);
      setClient(undefined);
      setDiscount("0");
      setCartOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  // Active services, minus the server's own catch-all for custom charges ("Monto libre" covers that).
  const all = useMemo(
    () => ((services.data ?? []) as ServiceRow[]).filter((s) => !!s.isActive && !(s.name === SERVER_CUSTOM_SERVICE && num(s.price) === 0)),
    [services.data],
  );
  const shown = useMemo(() => {
    const q = norm(search.trim());
    return q ? all.filter((s) => norm(s.name || "").includes(q)) : all;
  }, [all, search]);
  const qtyById = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of cart) if (i.serviceId && !i.isCustom) m.set(i.serviceId, (m.get(i.serviceId) ?? 0) + i.quantity);
    return m;
  }, [cart]);

  // Same math as before the redesign.
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountRaw = parseFloat(discount) || 0;
  const discountAmt = discountType === "percentage" ? Math.min(subtotal * (discountRaw / 100), subtotal) : Math.min(discountRaw, subtotal);
  const total = Math.max(0, subtotal - discountAmt);
  const count = cart.reduce((a, i) => a + i.quantity, 0);
  const zelleEmail = settings?.zelleEmail || null;

  const addLine = (item: Omit<CartItem, "id" | "quantity">) => {
    setCart((prev) => {
      // Tapping the same service at the same price again adds one more.
      const same = !item.isCustom && prev.find((i) => !i.isCustom && i.serviceId === item.serviceId && i.price === item.price);
      if (same) return prev.map((i) => (i === same ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { ...item, id: crypto.randomUUID(), quantity: 1 }];
    });
  };

  const openPad = (mode: PadMode) => { setPadKey((k) => k + 1); setPad(mode); };

  const pick = (s: ServiceRow) => {
    const price = num(s.price);
    if (price > 0) addLine({ serviceId: s.id, name: s.name, price, isCustom: false });
    else openPad({ kind: "service", service: s }); // no set price: ask how much
  };

  const onPad = (mode: PadMode, amount: number, label: string) => {
    if (!(amount > 0)) { toast.error(t.invalidAmount); return; }
    if (mode.kind === "free") addLine({ name: label || t.customCharge, price: amount, isCustom: true });
    else if (mode.kind === "service") addLine({ serviceId: mode.service.id, name: mode.service.name, price: amount, isCustom: false });
    else setCart((prev) => prev.map((i) => (i.id === mode.lineId ? { ...i, price: amount } : i)));
    setPad(null);
  };

  const updateQty = (id: string, d: number) => {
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(0, i.quantity + d) } : i)).filter((i) => i.quantity > 0));
  };

  const charge = () => {
    if (cart.length === 0) { toast.error(t.emptyCart); return; }
    if (readOnly || (payment === "zelle" && !zelleEmail)) return;
    const snapshot = {
      method: payment,
      customerName: client?.name,
      items: cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      subtotal, discount: discountAmt, total,
    };
    // Same input as before the redesign.
    createSale.mutate({
      customerId: client?.id,
      customerName: client?.name || undefined,
      items: cart.map((i) => ({
        serviceId: i.serviceId,
        serviceName: i.isCustom ? i.name : undefined,
        quantity: i.quantity,
        unitPrice: String(i.price.toFixed(2)),
      })),
      subtotal: String(subtotal.toFixed(2)),
      discount: String(discountAmt.toFixed(2)),
      total: String(total.toFixed(2)),
      paymentMethod: payment,
    }, {
      onSuccess: (res) => setDone({ ...snapshot, id: res.id, invoiceNumber: res.invoiceNumber, at: new Date().toISOString() }),
    });
  };

  const company: Company = useMemo(() => {
    const s = settings;
    const addr = [s?.address, s?.unitNumber].filter(Boolean).join(", ");
    const cityLine = [s?.city, [s?.state, s?.zipCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return { name: s?.companyName || "", lines: [addr, cityLine, s?.phone || ""].filter(Boolean) };
  }, [settings]);

  const cartProps: CartProps = {
    cart, onQty: updateQty, onRemove: (id) => updateQty(id, -Infinity),
    onEditPrice: (i) => openPad({ kind: "price", lineId: i.id, name: i.name, price: i.price }),
    client, onPickClient: () => setClientOpen(true), onClearClient: () => setClient(undefined),
    discount, onDiscount: setDiscount, discountType, onDiscountType: setDiscountType,
    subtotal, discountAmt, total, payment, onPayment: setPayment,
    zelleEmail, canManage, methods: copy.methods, t,
  };
  const chargeDisabled = cart.length === 0 || readOnly || (payment === "zelle" && !zelleEmail);
  const chargeBtn = <ChargeButton total={total} payment={payment} disabled={chargeDisabled} pending={createSale.isPending} onCharge={charge} t={t} />;
  const showBar = !done && cart.length > 0;

  return (
    <>
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl space-y-5">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.title}</h1>
              <p className="mt-0.5 text-sm text-slate-500">{t.sub}</p>
            </div>
            {!done && (
              <button onClick={() => openPad({ kind: "free" })} className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                <Calculator className="h-4 w-4" aria-hidden />{t.freeAmount}
              </button>
            )}
          </header>

          {readOnly && (
            <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{t.readOnly}
            </p>
          )}

          {done ? (
            <SaleDone sale={done} company={company} locale={locale} onNew={() => setDone(null)} t={t} methods={copy.methods} closeLabel={copy.close} />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
              <ServicePicker
                services={shown} noServices={all.length === 0} loading={services.isLoading} error={services.isError}
                onRetry={() => services.refetch()} retryLabel={copy.retry}
                search={search} onSearch={setSearch} qtyById={qtyById} onPick={pick} onFree={() => openPad({ kind: "free" })}
                canManage={canManage} t={t}
              />
              {/* Desktop: the sale stays in view; long sales scroll their lines, the total and the button never move. */}
              <aside className="hidden flex-col rounded-2xl border border-slate-200 bg-white p-5 lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100dvh-13rem)] lg:min-h-[24rem]" aria-labelledby="pos-cart">
                <div className="mb-3 flex shrink-0 items-baseline justify-between gap-2">
                  <h2 id="pos-cart" className="font-semibold text-slate-900">{t.cart.title}</h2>
                  {count > 0 && <span className="text-xs font-medium text-slate-500">{t.cart.items(count)}</span>}
                </div>
                {cart.length === 0 ? <CartEmpty t={t} /> : (
                  <>
                    <div className="-mx-5 min-h-[5rem] flex-1 overflow-y-auto px-5"><CartLines {...cartProps} /></div>
                    <div className="mt-3 shrink-0 border-t border-slate-100 pt-3"><CartSummary {...cartProps} /></div>
                    <div className="mt-4 shrink-0">{chargeBtn}</div>
                  </>
                )}
              </aside>
            </div>
          )}

          {/* Room for the phone summary bar */}
          {showBar && <div className="h-16 lg:hidden" aria-hidden />}
        </div>
      </AnimatedPage>

      {/* Phone: the sale summary sits above the tab bar and opens the cart (outside the animated wrapper so `fixed` works). */}
      {showBar && (
        <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-30 px-3 lg:hidden">
          <button
            onClick={() => setCartOpen(true)}
            aria-label={t.bar.open(t.cart.items(count), money(total))}
            className="mx-auto flex h-14 w-full max-w-md items-center gap-3 rounded-2xl bg-slate-900 pl-4 pr-2 text-left text-white shadow-lg shadow-slate-900/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="text-white/75">{t.cart.items(count)}</span>
              <span className="text-white/40"> · </span>
              <span className="text-base font-bold tabular-nums">{money(total)}</span>
            </span>
            <span className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-4 text-sm font-semibold">
              {t.bar.charge}<ChevronUp className="h-4 w-4" aria-hidden />
            </span>
          </button>
        </div>
      )}

      {/* Phone and tablet: the cart as a sheet */}
      <PosSheet
        open={cartOpen && !done} onOpenChange={setCartOpen} closeLabel={copy.close}
        title={t.cart.title} description={count > 0 ? t.cart.items(count) : undefined}
        footer={cart.length > 0 ? chargeBtn : undefined}
      >
        <CartBody {...cartProps} />
      </PosSheet>

      <ClientPicker open={clientOpen} onOpenChange={setClientOpen} selectedId={client?.id} onSelect={setClient} t={t} closeLabel={copy.close} />
      <AmountPad key={padKey} mode={pad} onClose={() => setPad(null)} onSubmit={onPad} t={t} closeLabel={copy.close} />
    </>
  );
}
