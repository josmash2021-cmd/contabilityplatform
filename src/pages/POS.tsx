import { useState, useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Minus, Plus, Trash2, Search, User, X, Check, Banknote, Smartphone, Receipt, ChevronUp } from "lucide-react";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";

interface CartItem {
  serviceId: number;
  name: string;
  price: number;
  quantity: number;
}

const PAYMENT_METHODS = [
  { id: "cash" as const, label: "Efectivo", icon: Banknote },
  { id: "zelle" as const, label: "Zelle", icon: Smartphone },
  { id: "card" as const, label: "Tarjeta", icon: Receipt },
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
  const [copiedZelle, setCopiedZelle] = useState(false);
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");

  const selectedCustomerData = customers?.find((c: NonNullable<typeof customers>[0]) => c.id === selectedCustomer);

  const filteredServices = useMemo(() => {
    return (servicesList ?? []).filter((s: NonNullable<typeof servicesList>[0]) => s.name.toLowerCase().includes(search.toLowerCase()) && s.isActive);
  }, [servicesList, search]);

  const addToCart = (service: (typeof filteredServices)[0]) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.serviceId === service.id);
      if (ex) return prev.map((i) => i.serviceId === service.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { serviceId: service.id!, name: service.name, price: parseFloat(String(service.price)), quantity: 1 }];
    });
  };

  const updateQty = (id: number, d: number) => {
    setCart((prev) => prev.map((i) => i.serviceId === id ? { ...i, quantity: Math.max(0, i.quantity + d) } : i).filter((i) => i.quantity > 0));
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
      items: cart.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity, unitPrice: String(i.price.toFixed(2)) })),
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
              <p className="text-xs text-neutral-400 mb-4">Crea servicios primero para poder cobrar</p>
              <Button onClick={() => window.location.href = "/services"} className="bg-black hover:bg-neutral-800 text-white text-xs h-8">
                Ir a Servicios
              </Button>
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
            </div>
          )}
        </AnimatedPage>
      </div>

      {/* Mobile Bottom Button: toggles cart when closed, opens payment when cart is open */}
      {cart.length > 0 && (
        <Dialog open={showPayment} onOpenChange={setShowPayment}>
          <DialogTrigger asChild>
            <button 
              onClick={() => {
                if (!showCart) setShowCart(true);
              }}
              className="lg:hidden fixed bottom-4 left-4 right-4 bg-black text-white rounded-xl px-4 py-3 flex items-center justify-between shadow-lg z-50 active:scale-[0.98] transition-transform"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{showCart ? "Cobrar" : `${cart.length} items`}</span>
                <span className="text-xs text-neutral-300">{formatCurrency(total)}</span>
              </div>
              {showCart ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronUp className={`w-5 h-5 transition-transform duration-300 ${showCart ? "rotate-180" : ""}`} />
              )}
            </button>
          </DialogTrigger>
          <DialogContent className="bg-white border-neutral-200 max-w-sm mx-4">
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
              copiedZelle={copiedZelle}
              setCopiedZelle={setCopiedZelle}
              handleZelleConfirm={handleZelleConfirm}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Cart Panel - Mobile: slide up, Desktop: sidebar */}
      <div className={`lg:hidden fixed inset-x-0 bottom-0 bg-white border-t border-neutral-200 rounded-t-2xl shadow-2xl transition-transform duration-300 z-40 flex flex-col ${showCart ? "translate-y-0" : "translate-y-full"}`} style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-neutral-100 flex items-center justify-between">
          <p className="text-sm font-medium">Carrito ({cart.length})</p>
          <button onClick={() => setShowCart(false)} className="text-neutral-400 hover:text-black transition-colors duration-150"><X className="w-5 h-5" /></button>
        </div>
        {/* Items — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
          <div className="space-y-3">
            {cart.map((item) => (
              <div key={item.serviceId} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-black truncate">{item.name}</p>
                  <p className="text-xs text-neutral-400">{formatCurrency(item.price)} c/u</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => updateQty(item.serviceId, -1)} className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors duration-150"><Minus className="w-3 h-3" /></button>
                  <span className="text-sm w-6 text-center font-medium">{item.quantity}</span>
                  <button onClick={() => updateQty(item.serviceId, 1)} className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors duration-150"><Plus className="w-3 h-3" /></button>
                </div>
                <span className="text-sm text-black min-w-[60px] text-right font-medium">{formatCurrency(item.price * item.quantity)}</span>
                <button onClick={() => updateQty(item.serviceId, -999)} className="text-neutral-300 hover:text-red-500 p-1 transition-colors duration-150"><Trash2 className="w-4 h-4" /></button>
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
                <div key={item.serviceId} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-black truncate">{item.name}</p>
                    <p className="text-xs text-neutral-400">{formatCurrency(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.serviceId, -1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-black transition-colors duration-150"><Minus className="w-3 h-3" /></button>
                    <span className="text-sm w-5 text-center">{item.quantity}</span>
                    <button onClick={() => updateQty(item.serviceId, 1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-black transition-colors duration-150"><Plus className="w-3 h-3" /></button>
                  </div>
                  <span className="text-sm text-black min-w-[56px] text-right">{formatCurrency(item.price * item.quantity)}</span>
                  <button onClick={() => updateQty(item.serviceId, -999)} className="text-neutral-300 hover:text-red-500 transition-colors duration-150"><Trash2 className="w-3.5 h-3.5" /></button>
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
          <Dialog open={showPayment} onOpenChange={setShowPayment}>
            <DialogTrigger asChild>
              <Button className="w-full bg-black hover:bg-neutral-800 text-white h-10 text-sm" disabled={cart.length === 0}>Cobrar</Button>
            </DialogTrigger>
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
                copiedZelle={copiedZelle}
                setCopiedZelle={setCopiedZelle}
                handleZelleConfirm={handleZelleConfirm}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

// Extracted Payment Dialog Component
function PaymentDialog({ 
  activePayment, setActivePayment, total, handleCheckout, createSalePending,
  showZellePanel, setShowZellePanel, companyZelleEmail, hasCompanyZelle,
  copiedZelle, setCopiedZelle, handleZelleConfirm
}: any) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {PAYMENT_METHODS.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => setActivePayment(m.id)}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-[border-color,background-color] duration-200 ease-out-expo ${activePayment === m.id ? "border-black bg-neutral-50" : "border-neutral-200 hover:border-neutral-300"}`}
            >
              <Icon className="w-5 h-5 text-neutral-600" />
              <span className="text-neutral-600">{m.label}</span>
            </button>
          );
        })}
      </div>

      {activePayment === "cash" && (
        <div className="space-y-4">
          <div className="text-center py-6 bg-neutral-50 rounded-lg space-y-2">
            <Banknote className="w-8 h-8 text-neutral-400 mx-auto" />
            <p className="text-xs text-neutral-400">Pago en efectivo</p>
            <p className="text-2xl font-medium text-black">{formatCurrency(total)}</p>
          </div>
          <Button onClick={handleCheckout} disabled={createSalePending} className="w-full bg-black hover:bg-neutral-800 text-white h-10">
            {createSalePending ? "Procesando..." : <><Check className="w-4 h-4 mr-1" /> Cobrar en Efectivo</>}
          </Button>
        </div>
      )}

      {activePayment === "zelle" && (
        <div className="space-y-4">
          {!showZellePanel ? (
            <div className="text-center py-4 bg-neutral-50 rounded-lg space-y-3">
              <Smartphone className="w-8 h-8 text-neutral-400 mx-auto" />
              <p className="text-xs text-neutral-400">Cobro via Zelle</p>
              <p className="text-2xl font-medium text-black">{formatCurrency(total)}</p>
              <Button onClick={() => setShowZellePanel(true)} className="bg-black hover:bg-neutral-800 text-white h-9 text-xs">
                <Smartphone className="w-3.5 h-3.5 mr-1.5" /> Mostrar datos de Zelle
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center py-4 bg-neutral-50 rounded-lg space-y-3">
                <Smartphone className="w-8 h-8 text-neutral-400 mx-auto" />
                <p className="text-xs text-neutral-400">Enviar Zelle a:</p>
                <div className="bg-white border border-neutral-200 rounded-lg p-3 mx-4">
                  <p className="text-sm font-medium text-black">{companyZelleEmail}</p>
                </div>
                <p className="text-2xl font-medium text-black">{formatCurrency(total)}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowZellePanel(false)} variant="outline" className="flex-1 border-neutral-200 h-10">Volver</Button>
                <Button onClick={handleZelleConfirm} disabled={createSalePending || !hasCompanyZelle} className="flex-1 bg-black hover:bg-neutral-800 text-white h-10">
                  {createSalePending ? "Procesando..." : <><Check className="w-4 h-4 mr-1" /> Confirmar Pago</>}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {activePayment === "card" && (
        <div className="space-y-4">
          <div className="text-center py-6 bg-neutral-50 rounded-lg space-y-2">
            <Receipt className="w-8 h-8 text-neutral-400 mx-auto" />
            <p className="text-xs text-neutral-400">Pago con tarjeta</p>
            <p className="text-2xl font-medium text-black">{formatCurrency(total)}</p>
          </div>
          <Button onClick={handleCheckout} disabled={createSalePending} className="w-full bg-black hover:bg-neutral-800 text-white h-10">
            {createSalePending ? "Procesando..." : <><Check className="w-4 h-4 mr-1" /> Cobrar con Tarjeta</>}
          </Button>
        </div>
      )}
    </div>
  );
}