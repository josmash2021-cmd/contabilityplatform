import { useState, useMemo } from "react";
import { trpc } from "@/providers/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Minus, Plus, Trash2, Search, User, X, Check, Banknote, Smartphone, Receipt,
  Package, ChevronDown
} from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";

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
      setSelectedService(null);
      setAmount("0");
      setDiscount("0");
      setShowPayment(false);
      setShowZellePanel(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [amount, setAmount] = useState("0");
  const [selectedCustomer, setSelectedCustomer] = useState<number | undefined>();
  const [selectedService, setSelectedService] = useState<any>(null);
  const [activePayment, setActivePayment] = useState("cash");
  const [showPayment, setShowPayment] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [showCart, setShowCart] = useState(false);
  const [showZellePanel, setShowZellePanel] = useState(false);
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");

  const selectedCustomerData = customers?.find((c: NonNullable<typeof customers>[0]) => c.id === selectedCustomer);

  const filteredServices = useMemo(() => {
    return (servicesList ?? []).filter((s: NonNullable<typeof servicesList>[0]) =>
      s.name.toLowerCase().includes(serviceSearch.toLowerCase()) && s.isActive
    );
  }, [servicesList, serviceSearch]);

  const appendDigit = (digit: string) => {
    setAmount((prev) => {
      if (digit === ".") {
        if (prev.includes(".")) return prev;
        return prev + ".";
      }
      if (prev === "0") return digit;
      const decPart = prev.split(".")[1];
      if (decPart && decPart.length >= 2) return prev;
      if (prev.replace(/[^0-9]/g, "").length >= 8 && !prev.includes(".")) return prev;
      return prev + digit;
    });
  };

  const clearAmount = () => setAmount("0");

  const backspace = () => {
    setAmount((prev) => (prev.length <= 1 ? "0" : prev.slice(0, -1)));
  };

  const selectService = (service: any) => {
    setSelectedService(service);
    setAmount(String(service.price ?? "0"));
    setServiceDialogOpen(false);
    setServiceSearch("");
  };

  const clearService = () => {
    setSelectedService(null);
    setAmount("0");
  };

  const addToCart = () => {
    const price = parseFloat(amount);
    if (Number.isNaN(price) || price <= 0) {
      toast.error("Ingresa un monto válido");
      return false;
    }
    const item: CartItem = {
      id: crypto.randomUUID(),
      serviceId: selectedService?.id,
      name: selectedService?.name || "Cargo personalizado",
      price,
      quantity: 1,
      isCustom: !selectedService,
    };
    setCart((prev) => [...prev, item]);
    setAmount("0");
    setSelectedService(null);
    return true;
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

  const handleCobrarClick = () => {
    if (cart.length === 0) {
      if (addToCart()) {
        setShowPayment(true);
      }
    } else {
      setShowPayment(true);
    }
  };

  const handleAddAnother = () => {
    addToCart();
  };

  const numericValue = parseFloat(amount) || 0;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-white lg:min-h-screen lg:h-auto lg:block">
      {/* Header */}
      <AnimatedPage className="shrink-0">
        <div className="px-3 lg:px-6 lg:pr-[400px] py-2 lg:pt-3 lg:pb-2 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <h1 className="text-base lg:text-lg font-medium text-black">Cobrar</h1>
            {selectedCustomerData ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs bg-neutral-100 px-2.5 py-1 rounded text-black">
                  <User className="w-3 h-3" /> {selectedCustomerData.name} {selectedCustomerData.lastName}
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
                  <ScrollArea className="h-64">
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
        </div>
      </AnimatedPage>

      {/* Main content */}
      <div className="flex-1 min-h-0 p-2 lg:p-4 lg:pr-[400px] lg:h-[calc(100vh-52px)] lg:flex lg:items-center">
        <AnimatedPage delay={100} className="w-full h-full">
          <div className="max-w-md mx-auto lg:mx-auto h-full flex flex-col">
            {/* Amount display */}
            <div className="shrink-0 bg-neutral-50 rounded-lg lg:rounded-xl p-2 lg:p-3 mb-1.5 lg:mb-2 text-center border border-neutral-100">
              <p className="text-[10px] text-neutral-400 uppercase tracking-wide mb-0.5">Monto a cobrar</p>
              <p className="text-2xl lg:text-4xl font-semibold text-black tracking-tight">{formatCurrency(numericValue)}</p>
            </div>

            {/* Selected service badge */}
            {selectedService && (
              <div className="shrink-0 flex items-center justify-center gap-2 mb-1.5 lg:mb-2">
                <span className="inline-flex items-center gap-1.5 text-[10px] lg:text-xs bg-black text-white px-2 py-0.5 lg:px-2.5 lg:py-1 rounded-full">
                  <Package className="w-3 h-3" /> {selectedService.name}
                  <button onClick={clearService} className="ml-1 hover:text-neutral-300"><X className="w-3 h-3" /></button>
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="shrink-0 grid grid-cols-2 gap-1.5 lg:gap-2 mb-1.5 lg:mb-2">
              <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
                <DialogTrigger asChild>
                  <button className="flex items-center justify-center gap-1.5 lg:gap-2 p-2 lg:p-2.5 rounded-lg border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-colors text-[10px] lg:text-xs font-medium text-black">
                    <Package className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> Servicio / Producto
                  </button>
                </DialogTrigger>
                <DialogContent className="bg-white border-neutral-200 max-w-sm">
                  <DialogHeader><DialogTitle className="text-black text-base font-medium">Seleccionar servicio</DialogTitle></DialogHeader>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                    <Input placeholder="Buscar servicios..." value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} className="pl-8 h-9 text-sm border-neutral-200" />
                  </div>
                  <ScrollArea className="h-60">
                    <div className="space-y-0.5">
                      {filteredServices.length === 0 ? (
                        <p className="text-sm text-neutral-400 text-center py-8">No hay servicios</p>
                      ) : (
                        filteredServices.map((s: NonNullable<typeof servicesList>[0]) => (
                          <button key={s.id} onClick={() => selectService(s)} className="w-full flex items-center justify-between p-3 rounded hover:bg-neutral-50 text-left transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-neutral-100 flex items-center justify-center text-xs text-neutral-600 font-medium">{(s.name || "?").charAt(0)}</div>
                              <p className="text-sm text-black">{s.name}</p>
                            </div>
                            <p className="text-sm font-medium text-black">{formatCurrency(s.price)}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </DialogContent>
              </Dialog>

              <Dialog>
                <DialogTrigger asChild>
                  <button className="flex items-center justify-center gap-1.5 lg:gap-2 p-2 lg:p-2.5 rounded-lg border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-colors text-[10px] lg:text-xs font-medium text-black">
                    <User className="w-3 h-3 lg:w-3.5 lg:h-3.5" /> Cliente
                  </button>
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
            </div>

            {/* Numeric keypad */}
            <div className="flex-1 min-h-0 grid grid-cols-3 grid-rows-4 gap-1.5 lg:gap-2 mb-1.5 lg:mb-2">
              {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((digit) => (
                <button
                  key={digit}
                  onClick={() => appendDigit(digit)}
                  className="h-full rounded-lg bg-white border border-neutral-200 text-lg lg:text-xl font-medium text-black hover:border-black hover:bg-neutral-50 active:scale-95 transition-all"
                >
                  {digit}
                </button>
              ))}
              <button
                onClick={clearAmount}
                className="h-full rounded-lg bg-neutral-100 text-xs lg:text-sm font-medium text-neutral-600 hover:bg-neutral-200 active:scale-95 transition-all"
              >
                C
              </button>
              <button
                onClick={() => appendDigit("0")}
                className="h-full rounded-lg bg-white border border-neutral-200 text-lg lg:text-xl font-medium text-black hover:border-black hover:bg-neutral-50 active:scale-95 transition-all"
              >
                0
              </button>
              <button
                onClick={() => appendDigit(".")}
                className="h-full rounded-lg bg-white border border-neutral-200 text-lg lg:text-xl font-medium text-black hover:border-black hover:bg-neutral-50 active:scale-95 transition-all"
              >
                .
              </button>
            </div>

            {/* Bottom row: backspace, add, charge */}
            <div className="shrink-0 grid grid-cols-3 gap-2">
              <button
                onClick={backspace}
                className="h-10 lg:h-12 rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:scale-95 transition-all flex items-center justify-center"
              >
                <X className="w-4 h-4 lg:w-5 lg:h-5" />
              </button>
              <Button
                onClick={handleAddAnother}
                disabled={numericValue <= 0}
                variant="outline"
                className="h-10 lg:h-12 rounded-lg border-neutral-200 text-black text-xs lg:text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5 lg:w-4 lg:h-4 mr-1" /> Agregar
              </Button>
              <Button
                onClick={handleCobrarClick}
                disabled={cart.length === 0 && numericValue <= 0}
                className="h-10 lg:h-12 rounded-lg bg-black hover:bg-neutral-800 text-white text-xs lg:text-sm font-medium disabled:opacity-50"
              >
                Cobrar
              </Button>
            </div>

            {/* Mobile cart preview */}
            <div className="lg:hidden shrink-0 mt-1.5 lg:mt-2">
              {cart.length > 0 && (
                <div className="border border-neutral-200 rounded-lg lg:rounded-xl p-2 lg:p-3">
                  <div className="flex items-center justify-between mb-1.5 lg:mb-3">
                    <p className="text-xs lg:text-sm font-medium">Items ({cart.length})</p>
                    <button onClick={() => setShowCart(!showCart)} className="text-[10px] lg:text-xs text-neutral-500 flex items-center gap-1">
                      {showCart ? "Ocultar" : "Ver"} <ChevronDown className={`w-3 h-3 transition-transform ${showCart ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {showCart && (
                    <div className="max-h-24 overflow-y-auto space-y-2 mb-2">
                      {cart.map((item) => (
                        <div key={item.id} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-black truncate">{item.name}</p>
                            <p className="text-[10px] text-neutral-400">{formatCurrency(item.price)} c/u</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateQty(item.id, -1)} className="w-5 h-5 lg:w-7 lg:h-7 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-600"><Minus className="w-2.5 h-2.5 lg:w-3 lg:h-3" /></button>
                            <span className="text-xs w-4 lg:w-6 text-center font-medium">{item.quantity}</span>
                            <button onClick={() => updateQty(item.id, 1)} className="w-5 h-5 lg:w-7 lg:h-7 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-600"><Plus className="w-2.5 h-2.5 lg:w-3 lg:h-3" /></button>
                          </div>
                          <button onClick={() => updateQty(item.id, -999)} className="text-neutral-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5 lg:w-4 lg:h-4" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-neutral-100 pt-1.5 lg:pt-3 flex justify-between items-center">
                    <span className="text-xs lg:text-sm text-neutral-500">Total</span>
                    <span className="text-base lg:text-xl font-bold text-black">{formatCurrency(total)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </AnimatedPage>
      </div>

      {/* Desktop Cart Sidebar */}
      <div className="hidden lg:flex fixed right-0 top-0 bottom-0 w-[380px] border-l border-neutral-200 bg-white flex-col">
        <div className="px-5 pt-4 pb-2 border-b border-neutral-100">
          <p className="text-xs text-neutral-400">{cart.length} items</p>
        </div>
        <ScrollArea className="flex-1 px-5 py-2">
          {cart.length === 0 ? <p className="text-neutral-300 text-sm text-center py-12">Agrega un monto para cobrar</p> : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-black truncate">{item.name}</p>
                    <p className="text-xs text-neutral-400">{formatCurrency(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-black transition-colors"><Minus className="w-3 h-3" /></button>
                    <span className="text-sm w-5 text-center">{item.quantity}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-100 text-neutral-400 hover:text-black transition-colors"><Plus className="w-3 h-3" /></button>
                  </div>
                  <span className="text-sm text-black min-w-[56px] text-right">{formatCurrency(item.price * item.quantity)}</span>
                  <button onClick={() => updateQty(item.id, -999)} className="text-neutral-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="px-5 py-3 border-t border-neutral-100 space-y-2">
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
          <div className="border-t border-neutral-100 pt-2 flex justify-between"><span className="text-black font-medium">Total</span><span className="text-lg font-medium text-black">{formatCurrency(total)}</span></div>
          <Button onClick={handleCobrarClick} disabled={cart.length === 0} className="w-full bg-black hover:bg-neutral-800 text-white h-9 text-sm">Cobrar</Button>
        </div>
      </div>

      {/* Payment Dialog */}
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
