import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Calculator, CalendarDays, ChevronDown, Eye } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { cobrarCopy } from "@/i18n/copy/cobrar";
import { centsToDecimal, changeDue, parseMoneyInput, splitPayment } from "../../api/lib/ventas";
import { ServiceTiles } from "@/components/pos/ServiceTiles";
import { SaleCard } from "@/components/pos/SaleCard";
import { PayPanel } from "@/components/pos/PayPanel";
import { ReceiptCard, type Company } from "@/components/pos/ReceiptCard";
import { DayClose } from "@/components/pos/DayClose";
import { ClientPicker, type PickedClient } from "@/components/pos/ClientPicker";
import { AmountPad } from "@/components/pos/AmountPad";
import { PageHead } from "@/components/pos/proto";
import { btn } from "@/components/pos/ui";
import {
  DEVICE_TZ, SERVER_CUSTOM_SERVICE, customerName, moneyC, norm, num,
  type CartItem, type DoneSale, type PadMode, type PayView, type ServiceRow,
} from "@/components/pos/posTypes";

const cents = (dollars: number) => Math.round(dollars * 100);

/**
 * Cobrar (the prototype's `pos` screen): tap services, check the sale, choose how they pay
 * (cash with change, Zelle, card, or split), charge; then the receipt. "Cierre del día" counts
 * the drawer. `?customer=<id>` starts the sale for that client (from Clientes → Cobrar).
 */
export default function POS() {
  const copy = useCopy(cobrarCopy);
  const t = copy.pos;
  const locale = intlLocale(useLang().lang);
  const utils = trpc.useUtils();
  const [params] = useSearchParams();

  const services = trpc.services.list.useQuery({ timeZone: DEVICE_TZ });
  const { data: settings } = trpc.settings.get.useQuery();
  // Team role (same cached query as the menu): an employee can't open Servicios or Ajustes; the accountant only reads.
  const { data: membership } = trpc.team.myMembership.useQuery(undefined, { staleTime: 60_000 });
  const canManage = !membership;
  const readOnly = membership?.role === "accountant";

  // Started from a client's card: that client, until the cashier picks another (or none).
  const preId = Number(params.get("customer")) || 0;
  const pre = trpc.customers.byId.useQuery({ id: preId }, { enabled: preId > 0, staleTime: 60_000 });
  const [picked, setPicked] = useState<PickedClient | null | undefined>(undefined);
  const preClient: PickedClient | undefined = pre.data ? { id: pre.data.id, name: customerName(pre.data), phone: pre.data.phone, email: pre.data.email } : undefined;
  const client = picked === undefined ? preClient : picked ?? undefined;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discount, setDiscount] = useState("");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [view, setView] = useState<PayView>("cash");
  const [received, setReceived] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitRest, setSplitRest] = useState<"card" | "zelle">("card");
  const [search, setSearch] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [pad, setPad] = useState<PadMode | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [done, setDone] = useState<DoneSale | null>(null);

  const createSale = trpc.sales.create.useMutation({
    onSuccess: () => {
      void utils.sales.list.invalidate();
      void utils.dashboard.summary.invalidate();
      void utils.services.list.invalidate(); // stock and "sold this month"
      void utils.sales.cashCount.today.invalidate();
      void utils.customers.overview.invalidate();
      void utils.customers.detail.invalidate();
      toast.success(t.saleRecorded);
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

  // Same math as before the redesign, in cents.
  const subtotalC = cart.reduce((s, i) => s + cents(i.price) * i.quantity, 0);
  const discountRaw = parseFloat(discount.replace(",", ".")) || 0;
  const discountC = Math.max(0, discountType === "percentage" ? Math.min(Math.round(subtotalC * (Math.min(discountRaw, 100) / 100)), subtotalC) : Math.min(cents(discountRaw), subtotalC));
  const totalC = Math.max(0, subtotalC - discountC);
  const count = cart.reduce((a, i) => a + i.quantity, 0);
  const zelle = settings?.zelleEmail?.trim() || null;

  /** Warns (never blocks) when a tracked product goes past what's in stock. */
  const warnStock = (serviceId: number | undefined, nextQty: number) => {
    const s = serviceId ? all.find((x) => x.id === serviceId) : undefined;
    if (s?.trackStock && nextQty > (s.stock ?? 0)) toast.warning(t.stockWarn(s.name, s.stock ?? 0));
  };

  const addLine = (item: Omit<CartItem, "id" | "quantity">) => {
    if (!item.isCustom && item.serviceId) warnStock(item.serviceId, (qtyById.get(item.serviceId) ?? 0) + 1);
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
    const line = cart.find((i) => i.id === id);
    if (line && d > 0 && line.serviceId) warnStock(line.serviceId, (qtyById.get(line.serviceId) ?? 0) + d);
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: Math.max(0, i.quantity + d) } : i)).filter((i) => i.quantity > 0));
  };

  const resetSale = () => {
    setCart([]); setDiscount(""); setDiscountOpen(false); setReceived(""); setSplitCash(""); setSearch(""); setView("cash");
  };

  const charge = () => {
    if (cart.length === 0) { toast.error(t.emptyCart); return; }
    if (readOnly || createSale.isPending) return;
    let payments: Array<{ method: "cash" | "zelle" | "card"; cents: number }> | null = null;
    let change = 0;
    if (view === "cash") {
      const rec = parseMoneyInput(received);
      const due = changeDue(totalC, rec);
      if (due.shortCents > 0) { toast.error(t.pay.shortToast(moneyC(due.shortCents))); return; }
      change = due.changeCents;
    } else if (view === "zelle") {
      if (!zelle) return;
    } else if (view === "split") {
      const res = splitPayment(totalC, parseMoneyInput(splitCash), splitRest);
      if (!res.ok) { toast.error(res.reason === "noCash" ? t.pay.splitNoCash : t.pay.splitAllCash); return; }
      if (splitRest === "zelle" && !zelle) return;
      payments = res.payments;
    }
    const method = view === "split" ? "mixed" : view;
    const snapshot: Omit<DoneSale, "id" | "invoiceNumber" | "at"> = {
      method,
      payments: payments ? payments.map((p) => ({ method: p.method, amount: p.cents / 100 })) : [],
      change: change / 100,
      customerName: client?.name,
      customerPhone: client?.phone ?? null,
      customerEmail: client?.email ?? null,
      items: cart.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      subtotal: subtotalC / 100, discount: discountC / 100, total: totalC / 100,
    };
    // Same input as before the redesign; a split sale adds its payments.
    createSale.mutate({
      customerId: client?.id,
      customerName: client?.name || undefined,
      items: cart.map((i) => ({
        serviceId: i.serviceId,
        serviceName: i.isCustom ? i.name : undefined,
        quantity: i.quantity,
        unitPrice: String(i.price.toFixed(2)),
      })),
      subtotal: centsToDecimal(subtotalC),
      discount: centsToDecimal(discountC),
      total: centsToDecimal(totalC),
      paymentMethod: method,
      ...(payments ? { payments: payments.map((p) => ({ method: p.method, amount: centsToDecimal(p.cents) })) } : {}),
    }, {
      onSuccess: (res) => {
        setDone({ ...snapshot, id: res.id, invoiceNumber: res.invoiceNumber, at: new Date().toISOString() });
        resetSale();
        setPicked(null);
        document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
      },
    });
  };

  const company: Company = useMemo(() => {
    const s = settings;
    const addr = [s?.address, s?.unitNumber].filter(Boolean).join(", ");
    const cityLine = [s?.city, [s?.state, s?.zipCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return { name: s?.companyName || "", lines: [addr, cityLine, s?.phone || ""].filter(Boolean) };
  }, [settings]);

  // Phone: a bar above the tab bar leads to the sale while it's out of view.
  const saleRef = useRef<HTMLElement>(null);
  const [saleVisible, setSaleVisible] = useState(true);
  const hasSale = !done && cart.length > 0;
  useEffect(() => {
    const el = saleRef.current;
    if (!el || !hasSale || typeof IntersectionObserver === "undefined") return;
    // The phone tab bar covers the bottom ~90px: what's under it doesn't count as seen.
    const io = new IntersectionObserver(([e]) => setSaleVisible(e.isIntersecting), { threshold: 0.15, rootMargin: "0px 0px -90px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasSale]);
  const showBar = hasSale && !saleVisible;

  return (
    <>
      <AnimatedPage className="p-4 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <PageHead
            title={t.title}
            sub={t.sub}
            right={
              <div className="flex flex-wrap gap-1.5">
                {!done && (
                  <button type="button" onClick={() => openPad({ kind: "free" })} className={btn()}>
                    <Calculator className="h-4 w-4" aria-hidden />{t.freeAmount}
                  </button>
                )}
                <button type="button" onClick={() => setDayOpen(true)} className={btn()}>
                  <CalendarDays className="h-4 w-4" aria-hidden />{t.dayClose}
                </button>
              </div>
            }
          />

          {readOnly && (
            <p className="mb-3.5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />{t.readOnly}
            </p>
          )}

          {/* `.cols`: tiles at the left, the sale at the right (stacked on the phone). */}
          <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <ServiceTiles
              services={shown} noServices={all.length === 0} loading={services.isLoading} error={services.isError}
              onRetry={() => void services.refetch()} retryLabel={copy.retry}
              search={search} onSearch={setSearch} qtyById={done ? new Map() : qtyById} onPick={(s) => { setDone(null); pick(s); }} onFree={() => openPad({ kind: "free" })}
              canManage={canManage} t={t}
            />
            {done ? (
              <ReceiptCard sale={done} company={company} locale={locale} onNew={() => setDone(null)} t={t} methods={copy.methods} closeLabel={copy.close} />
            ) : (
              <SaleCard
                ref={saleRef} t={t} cart={cart} clientLabel={client?.name ?? t.cart.counter} onPickClient={() => setClientOpen(true)}
                onQty={updateQty} onEditPrice={(i) => openPad({ kind: "price", lineId: i.id, name: i.name, price: i.price })}
                discountOpen={discountOpen || discountC > 0} onOpenDiscount={() => setDiscountOpen(true)}
                discount={discount} onDiscount={setDiscount} discountType={discountType} onDiscountType={setDiscountType}
                subtotalC={subtotalC} discountC={discountC} totalC={totalC}
              >
                {cart.length > 0 && (
                  <PayPanel
                    t={t} totalC={totalC} view={view} onView={setView}
                    received={received} onReceived={setReceived} splitCash={splitCash} onSplitCash={setSplitCash}
                    splitRest={splitRest} onSplitRest={setSplitRest} zelle={zelle} canManage={canManage}
                    disabled={readOnly} pending={createSale.isPending} onCharge={charge}
                  />
                )}
              </SaleCard>
            )}
          </div>

          {showBar && <div className="h-16 lg:hidden" aria-hidden />}
        </div>
      </AnimatedPage>

      {/* Phone: the sale's total sits above the tab bar while the sale is out of view (outside the animated wrapper so `fixed` works). */}
      {showBar && (
        <div data-pos-bar className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] z-30 px-3 lg:hidden">
          <button
            type="button"
            onClick={() => saleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            aria-label={t.bar.label(t.cart.items(count), moneyC(totalC))}
            className="mx-auto flex h-14 w-full max-w-md items-center gap-3 rounded-2xl bg-slate-900 pl-4 pr-2 text-left text-white shadow-lg shadow-slate-900/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold tabular-nums">{t.bar.see(t.cart.items(count), moneyC(totalC))}</span>
            <span className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-blue-600 px-4 text-sm font-semibold">
              {t.bar.go}<ChevronDown className="h-4 w-4" aria-hidden />
            </span>
          </button>
        </div>
      )}

      <ClientPicker open={clientOpen} onOpenChange={setClientOpen} selectedId={client?.id} onSelect={(c) => setPicked(c ?? null)} t={t} closeLabel={copy.close} />
      <AmountPad key={padKey} mode={pad} onClose={() => setPad(null)} onSubmit={onPad} t={t} closeLabel={copy.close} />
      <DayClose open={dayOpen} onOpenChange={setDayOpen} t={t} methods={copy.methods} locale={locale} closeLabel={copy.close} retryLabel={copy.retry} readOnly={readOnly} />
    </>
  );
}
