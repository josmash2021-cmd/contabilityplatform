import { useState, useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Search, User, X, Check, Banknote, Smartphone, Receipt, ChevronUp, DollarSign, RefreshCw, RotateCcw, Square, ClipboardList } from "lucide-react";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";

interface CartItem {
  id: string;
  serviceId?: number;
  name: string;
  price: number;
  quantity: number;
  isCustom?: boolean;
}

const PAYMENT_METHODS = [
  { id: "cash" as const, label: "Efectivo", icon: Banknote },
  { id: "zelle" as const, label: "Zelle", icon: Smartphone },
  { id: "card" as const, label: "Tarjeta", icon: Receipt },
];

const QUICK_SERVICES = [
  { id: "plate_change", label: "Cambio de placa de estado", icon: RefreshCw },
  { id: "sticker_renewal", label: "Renovación de sticker", icon: RotateCcw },
  { id: "new_plate", label: "Placa nueva", icon: Square },
  { id: "title_process", label: "Trámite de título", icon: ClipboardList },
];

export default function POS() {
  const { data: servicesList } = trpc.services.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery({ type: "all" });
  const { data: settings } = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();

  const createSale = trpc.sales.create.useMutation({
    onSuccess: () => {
      utils.sales.list.invalidate();
      utils.dashboard.summary.invalidate();
      toast.success("Venta registrada");
      setCart([]);
      setSelectedCustomer(undefined);
      setDiscount("0");
      setShowPayment(false);
      setShowZellePanel(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<number | undefined>();
  const [activePayment, setActivePayment] = useState("cash");
  const [showPayment, setShowPayment] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [showCart, setShowCart] = useState(false);
  const [showZellePanel, setShowZellePanel] = useState(false);
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [quickChargeOpen, setQuickChargeOpen] = useState(false);
  const [quickService, setQuickService] = useState("");
  const [quickAmount, setQuickAmount] = useState("");

  const selectedCustomerData = customers?.find((c: NonNullable<typeof customers>[0]) => c.id === selectedCustomer);

  const filteredServices = useMemo(() => {
    return (servicesList ?? []).filter((s: NonNullable<typeof servicesList>[0]) => s.name.toLowerCase().includes(search.toLowerCase()) && s.isActive);
  }, [servicesList, search]);

  const addToCart = (service: (typeof filteredServices)[0]) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.serviceId === service.id);
      if (ex) return prev.map((i) => i.serviceId === service.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: crypto.randomUUID(), serviceId: service.id!, name: service.name, price: parseFloat(String(service.price)), quantity: 1 }];
    });
  };

  const addCustomCharge = () => {
    const price = parseFloat(customPrice);
    if (Number.isNaN(price) || price <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    const name = customName.trim() || "Cargo personalizado";
    setCart((prev) => [...prev, { id: crypto.randomUUID(), name, price, quantity: 1, isCustom: true }]);
    setCustomName("");
    setCustomPrice("");
    setCustomOpen(false);
  };

  const addQuickCharge = () => {
    const price = parseFloat(quickAmount);
    if (Number.isNaN(price) || price <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    if (!quickService) {
      toast.error("Selecciona un servicio");
      return;
    }
    const service = QUICK_SERVICES.find((s) => s.id === quickService);
    setCart((prev) => [...prev, { id: crypto.randomUUID(), name: service?.label ?? "Servicio", price, quantity: 1, isCustom: true }]);
    setQuickAmount("");
    setQuickService("");
    setQuickChargeOpen(false);
    setShowPayment(true);
  };

  const handleCobrarClick = () => {
    if (cart.length === 0) {
      setQuickChargeOpen(true);
    } else {
      setShowPayment(true);
    }
  };

  const updateQty = (id: string, d: number) => {
    setCart((prev) => prev.map((i) => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + d) } : i).filter((i) => i.quantity > 0));
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const discountRaw = parseFloat(discount) || 0;
  const discountAmt = discountType === "percentage" ? Math.min(subtotal * (discountRaw / 100), subtotal) : Math.min(discountRaw, subtotal);
  const total = Math.max(0, subtotal - discountAmt);

  const companyZelleEmail = settings?.zelleEmail || "No configurado";
  const hasCompanyZelle = !!settings?.zelleEmail;

  const handleSale = (method: string) => {
    createSale.mutate({
      customerId: selectedCustomer,
      customerName: selectedCustomerData ? `${selectedCustomerData.name} ${selectedCustomerData.lastName || ""}`.trim() : undefined,
      items: cart.map((i) => ({
        serviceId: i.serviceId,
        serviceName: i.isCustom ? i.name : undefined,
        quantity: i.quantity,
        unitPrice: String(i.price.toFixed(2)),
      })),
      subtotal: String(subtotal.toFixed(2)),
      discount: String(discountAmt.toFixed(2)),
      total: String(total.toFixed(2)),
      paymentMethod: method as "cash" | "zelle" | "card" | "mixed",
    });
  };

  const handleCheckout = () => {
    if (cart.length === 0) { toast.error("Carrito vacio"); return; }
    handleSale(activePayment);
  };

  const handleZelleConfirm = () => {
    handleSale("zelle");
  };

  return (
    <div className="min-h-screen bg-white pb-20 lg:pb-0">
      {/* Header */}
      <AnimatedPage>
        <div className="px-4 lg:px-6 lg:pr-[400px] pt-4 lg:pt-6 pb-3 border-b border-neutral-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-medium text-black">Vender</h1>
            {selectedCustomerData ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs bg-neutral-100 px-2.5 py-1 rounded text-black">
                  <User className="w-3 h-3" /> {selectedCustomerData.name}
                  <button onClick={() => setSelectedCustomer(undefined)} className="ml-1 text-neutral-400 hover:text-black transition-colors duration-150"><X className="w-3 h-3" /></button>
                </span>
              </div>
            ) : (
              <Dialog>
                <DialogTrigger asChild>
                  <button className="text-xs text-neutral-500 hover:text-black border border-neutral-200 px-3 py-1.5 rounded transition-colors duration-150">Cliente</button>
                </DialogTrigger>
                <DialogContent className="bg-white border-neutral-200 max-w-sm">
                  <DialogHeader><DialogTitle className="text-black text-base font-medium">Cliente</DialogTitle></DialogHeader>
                  <ScrollArea className="h-72">
                    <div className="space-y-0.5">
                      {customers?.map((c: NonNullable<typeof customers>[0]) => (
                        <button key={c.id} onClick={() => setSelectedCustomer(c.id)} className="w-full flex items-center gap-3 p-2.5 rounded hover:bg-neutral-50 text-left transition-colors duration-150">
                          <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-xs text-neutral-600 font-medium">{(c.name || "?").charAt(0)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-black">{c.name} {c.lastName}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <Input placeholder="Buscar servicios..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-sm border-neutral-200 rounded-md" />
          </div>
        </div>
      </AnimatedPage>

      {/* Services Grid */}
      <div className="p-4 lg:p-6 lg:pr-[400px]">
        <AnimatedPage delay={100}>
          {filteredServices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-neutral-400 mb-2">No hay servicios disponibles</p>
              <p className="text-xs text-neutral-400 mb-4">Crea servicios primero o usa un monto libre</p>
              <div className="flex gap-2">
                <Button onClick={() => setCustomOpen(true)} variant="outline" className="border-neutral-200 text-black text-xs h-8">
                  <DollarSign className="w-3.5 h-3.5 mr-1.5" /> Monto libre
                </Button>
                <Button onClick={() => window.location.href = "/services"} className="bg-black hover:bg-neutral-800 text-white text-xs h-8">
                  Ir a Servicios
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredServices.map((s: typeof filteredServices[0], i: number) => (
                <AnimatedCard key={s.id} delay={100 + i * 40}>
                  <button onClick={() => addToCart(s)} className="w-full text-left p-3 border border-neutral-200 rounded-lg hover:border-black hover:bg-neutral-50 transition-[border-color,background-color] duration-200 ease-out-expo group">
                    {s.image ? (
                      <img src={s.image} alt={s.name} className="w-full aspect-square rounded-md object-cover mb-2" />
                    ) : (
                      <div className="w-full aspect-square rounded-md bg-neutral-100 mb-2 flex items-center justify-center">
                        <span className="text-neutral-300 text-lg font-light group-hover:text-neutral-500 transition-colors duration-150">{(s.name || "?").charAt(0)}</span>
                      </div>
                    )}
                    <p className="text-sm text-black truncate">{s.name}</p>
                    <p className="text-sm font-medium text-black mt-1">{formatCurrency(s.price)}</p>
                  </button>
                </AnimatedCard>
              ))}
              <AnimatedCard key="custom" delay={100 + filteredServices.length * 40}>
                <button onClick={() => setCustomOpen(true)} className="w-full h-full min-h-[160px] text-left p-3 border border-dashed border-neutral-300 rounded-lg hover:border-black hover:bg-neutral-50 transition-[border-color,background-color] duration-200 ease-out-expo group flex flex-col items-center justify-center gap-2">
                  <div className="w-full aspect-square rounded-md bg-neutral-100 mb-2 flex items-center justify-center">
                    <DollarSign className="w-8 h-8 text-neutral-300 group-hover:text-neutral-500 transition-colors duration-150" />
                  </div>
                  <p className="text-sm text-black truncate">Monto libre</p>
                  <p className="text-xs text-neutral-400">Ingresa el monto</p>
                </button>
              </AnimatedCard>
            </div>
          )}
        </AnimatedPage>
      </div>

      {/* Mobile Bottom Button */}
      <button
        onClick={handleCobrarClick}
        className="lg:hidden fixed bottom-4 left-4 right-4 bg-black text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-lg z-50 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{cart.length > 0 ? `${cart.length} items` : "Cobrar"}</span>
          {cart.length > 0 && <span className="text-xs text-neutral-300">{formatCurrency(total)}</span>}
        </div>
        {cart.length > 0 ? (
          <ChevronUp className="w-5 h-5" />
        ) : (
          <Plus className="w-5 h-5" />
        )}
      </button>

      {/* Cart Panel - Mobile: slide up, Desktop: sidebar */}
      <div className={`lg:hidden fixed inset-x-0 bottom-0 bg-white border-t border-neutral-200 rounded-t-2xl shadow-2xl transition-transform duration-300 z-40 flex flex-col ${showCart ? "translate-y-0 pb-20" : "translate-y-full"}`} style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-neutral-100 flex items-center justify-between">
          <p className="text-sm font-medium">Carrito ({cart.length})</p>
          <button onClick={() => setShowCart(false)} className="text-neutral-400 hover:text-black transition-colors duration-150"><X className="w-5 h-5" /></button>
        </div>
        {/* Items — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          <div className="space-y-3">
            {cart.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-black truncate">{item.name}</p>
                  <p className="text-xs text-neutral-400">{formatCurrency(item.price)} c/u</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors duration-150"><Minus className="w-3 h-3" /></button>
                  <span className="text-sm w-6 text-center font-medium">{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors duration-150"><Plus className="w-3 h-3" /></button>
                </div>
                <span className="text-sm text-black min-w-[60px] text-right font-medium">{formatCurrency(item.price * item.quantity)}</span>
                <button onClick={() => updateQty(item.id, -999)} className="text-neutral-300 hover:text-red-500 p-1 transition-colors duration-150"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </div>
        {/* Totals + Cobrar — always visible at bottom */}
        <div className="shrink-0 px-4 py-4 border-t border-neutral-100 space-y-3 bg-white">
          <div className="flex justify-between text-sm"><span className="text-neutral-500">Subtotal</span><span className="text-black">{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-sm items-center">
            <span className="text-neutral-500">Descuento</span>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 rounded-full p-0.5">
                <button onClick={() => setDiscountType("fixed")} className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${discountType === "fixed" ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}>$</button>
                <button onClick={() => setDiscountType("percentage")} className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${discountType === "percentage" ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}>%</button>
              </div>
              <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-20 h-8 text-right text-sm border-neutral-200" min="0" step={discountType === "percentage" ? "1" : "0.01"} max={discountType === "percentage" ? "100" : undefined} />
            </div>
          </div>
          {discountType === "percentage" && discountRaw > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-neutral-400">Equivale a</span>
              <span className="text-neutral-500">-{formatCurrency(discountAmt)}</span>
            </div>
          )}
          <div className="border-t border-neutral-100 pt-3 flex justify-between"><span className="text-black font-medium text-base">Total</span><span className="text-xl font-bold text-black">{formatCurrency(total)}</span></div>
        </div>
      </div>

      {/* Desktop Cart Sidebar */}
      <div className="hidden lg:flex fixed right-0 top-0 bottom-0 w-[380px] border-l border-neutral-200 bg-white flex-col">
        <div className="px-5 pt-6 pb-3 border-b border-neutral-100">
          <p className="text-xs text-neutral-400">{cart.length} servicios</p>
        </div>
        <ScrollArea className="flex-1 px-5 py-3">
          {cart.length === 0 ? <p className="text-neutral-300 text-sm text-center py-12">Agrega servicios</p> : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-black truncate">{item.name}</p>
                    <p className="text-xs text-neutral-400">{formatCurrency(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-black transition-colors duration-150"><Minus className="w-3 h-3" /></button>
                    <span className="text-sm w-5 text-center">{item.quantity}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-black transition-colors duration-150"><Plus className="w-3 h-3" /></button>
                  </div>
                  <span className="text-sm text-black min-w-[56px] text-right">{formatCurrency(item.price * item.quantity)}</span>
                  <button onClick={() => updateQty(item.id, -999)} className="text-neutral-300 hover:text-red-500 transition-colors duration-150"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="px-5 py-4 border-t border-neutral-100 space-y-3">
          <div className="flex justify-between text-sm"><span className="text-neutral-400">Subtotal</span><span className="text-black">{formatCurrency(subtotal)}</span></div>
          <div className="flex justify-between text-sm items-center">
            <span className="text-neutral-400">Descuento</span>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 rounded-full p-0.5">
                <button onClick={() => setDiscountType("fixed")} className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${discountType === "fixed" ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}>$</button>
                <button onClick={() => setDiscountType("percentage")} className={`px-2 py-0.5 text-[10px] font-medium rounded-full transition-colors ${discountType === "percentage" ? "bg-white text-black shadow-sm" : "text-neutral-500"}`}>%</button>
              </div>
              <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} className="w-16 h-7 text-right text-sm border-neutral-200" min="0" step={discountType === "percentage" ? "1" : "0.01"} max={discountType === "percentage" ? "100" : undefined} />
            </div>
          </div>
          {discountType === "percentage" && discountRaw > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-neutral-400">Equivale a</span>
              <span className="text-neutral-500">-{formatCurrency(discountAmt)}</span>
            </div>
          )}
          <div className="border-t border-neutral-100 pt-3 flex justify-between"><span className="text-black font-medium">Total</span><span className="text-lg font-medium text-black">{formatCurrency(total)}</span></div>
          <Button onClick={handleCobrarClick} className="w-full bg-black hover:bg-neutral-800 text-white h-10 text-sm">Cobrar</Button>
          <Dialog open={showPayment} onOpenChange={setShowPayment}>
            <DialogContent className="bg-white border-neutral-200 max-w-md">
              <DialogHeader><DialogTitle className="text-black font-medium">Metodo de cobro</DialogTitle></DialogHeader>
              <PaymentDialog 
                activePayment={activePayment} 
                setActivePayment={setActivePayment} 
                total={total} 
                handleCheckout={handleCheckout} 
                createSalePending={createSale.isPending}
                showZellePanel={showZellePanel}
                setShowZellePanel={setShowZellePanel}
                companyZelleEmail={companyZelleEmail}
                hasCompanyZelle={hasCompanyZelle}
                handleZelleConfirm={handleZelleConfirm}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Custom Amount Dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="bg-white border-neutral-200 max-w-sm">
          <DialogHeader><DialogTitle className="text-black text-base font-medium">Monto libre</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-neutral-500 mb-1.5 block">Descripción (opcional)</label>
              <Input placeholder="Ej: Pago por reparación" value={customName} onChange={(e) => setCustomName(e.target.value)} className="h-9 text-sm border-neutral-200" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1.5 block">Monto</label>
              <Input type="number" placeholder="0.00" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} className="h-9 text-sm border-neutral-200" min="0" step="0.01" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => setCustomOpen(false)} variant="outline" className="flex-1 border-neutral-200 text-black h-9 text-xs">Cancelar</Button>
              <Button onClick={addCustomCharge} disabled={!customPrice || Number.isNaN(parseFloat(customPrice)) || parseFloat(customPrice) <= 0} className="flex-1 bg-black hover:bg-neutral-800 text-white h-9 text-xs">Agregar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Charge Dialog */}
      <Dialog open={quickChargeOpen} onOpenChange={setQuickChargeOpen}>
        <DialogContent className="bg-white border-neutral-200 max-w-sm">
          <DialogHeader><DialogTitle className="text-black text-base font-medium">Nuevo cobro</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-neutral-500 mb-1.5 block">Servicio</label>
              <div className="grid grid-cols-1 gap-2">
                {QUICK_SERVICES.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setQuickService(s.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${quickService === s.id ? "border-black bg-black text-white" : "border-neutral-200 bg-white text-black hover:border-neutral-400"}`}
                    >
                      <Icon className={`w-5 h-5 ${quickService === s.id ? "text-white" : "text-neutral-500"}`} />
                      <span className="text-sm font-medium">{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1.5 block">Monto</label>
              <Input type="number" placeholder="0.00" value={quickAmount} onChange={(e) => setQuickAmount(e.target.value)} className="h-9 text-sm border-neutral-200" min="0" step="0.01" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => setQuickChargeOpen(false)} variant="outline" className="flex-1 border-neutral-200 text-black h-9 text-xs">Cancelar</Button>
              <Button onClick={addQuickCharge} disabled={!quickService || !quickAmount || Number.isNaN(parseFloat(quickAmount)) || parseFloat(quickAmount) <= 0} className="flex-1 bg-black hover:bg-neutral-800 text-white h-9 text-xs">Continuar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Extracted Payment Dialog Component
function PaymentDialog({ 
  activePayment, setActivePayment, total, handleCheckout, createSalePending,
  showZellePanel, setShowZellePanel, companyZelleEmail, hasCompanyZelle,
  handleZelleConfirm
}: any) {
  return (
    <div className="relative flex flex-col h-full">
      {/* Payment Method Selection */}
      <div className="relative z-10 flex-shrink-0 pt-4">
        <div className="grid grid-cols-3 gap-3">
          {PAYMENT_METHODS.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => { setActivePayment(m.id); setShowZellePanel(false); }}
                className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${activePayment === m.id ? "border-black bg-black text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"}`}
              >
                <Icon className={`w-6 h-6 ${activePayment === m.id ? "text-white" : "text-neutral-500"}`} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Amount Display - Centered */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center min-h-0">
        {activePayment === "cash" && (
          <div className="text-center space-y-3">
            <Banknote className="w-12 h-12 text-neutral-300 mx-auto" />
            <p className="text-sm text-neutral-400">Pago en efectivo</p>
            <p className="text-4xl font-bold text-black">{formatCurrency(total)}</p>
          </div>
        )}

        {activePayment === "zelle" && !showZellePanel && (
          <div className="text-center space-y-4">
            <Smartphone className="w-12 h-12 text-neutral-300 mx-auto" />
            <p className="text-sm text-neutral-400">Cobro via Zelle</p>
            <p className="text-4xl font-bold text-black">{formatCurrency(total)}</p>
          </div>
        )}

        {activePayment === "zelle" && showZellePanel && (
          <div className="text-center space-y-4 w-full">
            <Smartphone className="w-12 h-12 text-neutral-300 mx-auto" />
            <p className="text-sm text-neutral-400">Enviar Zelle a:</p>
            <div className="bg-white border border-neutral-200 rounded-xl p-4 mx-8">
              <p className="text-lg font-semibold text-black">{companyZelleEmail}</p>
            </div>
            <p className="text-4xl font-bold text-black">{formatCurrency(total)}</p>
          </div>
        )}

        {activePayment === "card" && (
          <div className="text-center space-y-3">
            <Receipt className="w-12 h-12 text-neutral-300 mx-auto" />
            <p className="text-sm text-neutral-400">Pago con tarjeta</p>
            <p className="text-4xl font-bold text-black">{formatCurrency(total)}</p>
          </div>
        )}
      </div>

      {/* Action Button - Bottom */}
      <div className="relative z-10 flex-shrink-0 pb-6 pt-4">
        {activePayment === "zelle" && !showZellePanel && (
          <Button onClick={() => setShowZellePanel(true)} className="w-full bg-black hover:bg-neutral-800 text-white h-14 text-base rounded-xl">
            <Smartphone className="w-5 h-5 mr-2" /> Mostrar datos de Zelle
          </Button>
        )}
        {activePayment === "zelle" && showZellePanel && (
          <div className="flex gap-3">
            <Button onClick={() => setShowZellePanel(false)} variant="outline" className="flex-1 border-neutral-200 h-14 text-base rounded-xl">Volver</Button>
            <Button onClick={handleZelleConfirm} disabled={createSalePending || !hasCompanyZelle} className="flex-1 bg-black hover:bg-neutral-800 text-white h-14 text-base rounded-xl">
              {createSalePending ? "Procesando..." : <><Check className="w-5 h-5 mr-1" /> Confirmar</>}
            </Button>
          </div>
        )}
        {activePayment !== "zelle" && (
          <Button onClick={handleCheckout} disabled={createSalePending} className="w-full bg-black hover:bg-neutral-800 text-white h-14 text-base rounded-xl">
            {createSalePending ? "Procesando..." : <><Check className="w-5 h-5 mr-2" /> {activePayment === "cash" ? "Cobrar en Efectivo" : "Cobrar con Tarjeta"}</>}
          </Button>
        )}
      </div>
    </div>
  );
}