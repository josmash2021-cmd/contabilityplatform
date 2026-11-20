import { useState, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Building2, CreditCard, Receipt, Wifi, Unlink, Loader2, Crown, ChevronDown, ChevronUp, User, Mail, Lock } from "lucide-react";
import SubscriptionSettings from "@/components/SubscriptionSettings";
import { AnimatedPage, AnimatedCard } from "@/components/AnimatedPage";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";
import { useCopy } from "@/i18n/useI18n";
import { billingCopy } from "@/i18n/copy/billing";

function CloverSettings() {
  const { settings } = useCopy(billingCopy);
  const t = settings.clover;
  const utils = trpc.useUtils();
  const { data: account } = trpc.clover.getAccount.useQuery();
  const connectMut = trpc.clover.connect.useMutation({
    onSuccess: (data) => {
      if (data.success) { toast.success(t.connected(String(data.merchantName))); utils.clover.getAccount.invalidate(); setMerchantId(""); setAccessToken(""); setIsOpen(false); }
      else { toast.error(data.error || t.connectError); }
    },
    onError: (err) => toast.error(err.message),
  });
  const disconnectMut = trpc.clover.disconnect.useMutation({
    onSuccess: () => { toast.success(t.disconnected); utils.clover.getAccount.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const [merchantId, setMerchantId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const isConnected = !!account;

  return (
    <div className="space-y-3">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between py-2 px-1 rounded-lg hover:bg-neutral-50 transition-colors duration-150">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-neutral-400" />
          <span className="text-sm text-neutral-700">Clover POS</span>
          {isConnected && <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0"><Wifi className="w-2.5 h-2.5 mr-0.5" /> {t.connectedBadge}</Badge>}
        </div>
        {isOpen ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>

      <div className={`overflow-hidden transition-all duration-300 ease-out-expo ${isOpen ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="pt-2 space-y-3">
          {isConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Wifi className="w-4 h-4 text-emerald-600" />
                <span className="text-black font-medium">{account.merchantName || t.connectedFallback}</span>
                <span className="text-xs text-neutral-400">({account.merchantId})</span>
              </div>
              {account.deviceId && <div className="text-xs text-neutral-500 bg-neutral-50 p-2 rounded"><span className="text-neutral-400">{t.terminal}</span> {account.deviceName || account.deviceId}</div>}
              {!account.deviceId && <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">{t.noTerminal}</div>}
              <Button variant="outline" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending} className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8">
                <Unlink className="w-3.5 h-3.5 mr-1.5" /> {t.disconnect}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-neutral-400">{t.intro}</p>
              <div className="space-y-2"><label className="text-xs text-neutral-400 block">Merchant ID *</label>
                <Input value={merchantId} onChange={(e) => setMerchantId(e.target.value)} placeholder={settings.example("ABCD123456789")} className="border-neutral-200 text-sm" /></div>
              <div className="space-y-2"><label className="text-xs text-neutral-400 block">API Token *</label>
                <Input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={settings.example("12345678-1234-1234-1234-123456789abc")} className="border-neutral-200 text-sm" />
                <p className="text-[10px] text-neutral-400">{t.tokenHint}</p></div>
              <div className="space-y-2"><label className="text-xs text-neutral-400 block">{t.deviceLabel}</label>
                <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder={settings.example("C081UG42553306")} className="border-neutral-200 text-sm" />
                <p className="text-[10px] text-neutral-400">{t.deviceHint}</p></div>
              <Button onClick={() => connectMut.mutate({ merchantId, accessToken, deviceId: deviceId || undefined })} disabled={connectMut.isPending || !merchantId || !accessToken} className="bg-black hover:bg-neutral-800 text-white text-xs h-8">
                {connectMut.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> {t.connecting}</> : <><Wifi className="w-3.5 h-3.5 mr-1.5" /> {t.connect}</>}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const userMode = user?.modePreference || "business";

  if (userMode === "personal") {
    return <PersonalSettings />;
  }

  return <BusinessSettings />;
}

// ─── PERSONAL SETTINGS ───
function PersonalSettings() {
  const { user, logout } = useAuth();
  const { settings } = useCopy(billingCopy);
  const t = settings.personal;

  return (
    <div className="p-6 lg:p-10 space-y-6 bg-white min-h-screen max-w-2xl mx-auto">
      <AnimatedPage>
        <div>
          <h1 className="text-2xl font-medium text-black">{t.title}</h1>
          <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
        </div>
      </AnimatedPage>

      <div className="space-y-4">
        {/* Profile Info */}
        <AnimatedCard delay={80}>
          <Card className="border-neutral-200 rounded-lg shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-black text-sm font-normal flex items-center gap-2">
                <User className="w-4 h-4 text-neutral-400" /> {t.info}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full bg-neutral-100 flex items-center justify-center text-lg font-medium text-neutral-600">
                  {(user?.name || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-base font-medium text-black">{user?.name || t.noName}</p>
                  <p className="text-sm text-neutral-500">{user?.email || t.noEmail}</p>
                </div>
              </div>
              {/* Language */}
              <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
                <span className="text-xs text-neutral-400">{settings.language}</span>
                <LanguageSwitcher />
              </div>
            </CardContent>
          </Card>
        </AnimatedCard>

        {/* Subscription */}
        <AnimatedCard delay={160}>
          <Card className="border-neutral-200 rounded-lg shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-black text-sm font-normal flex items-center gap-2">
                <Crown className="w-4 h-4 text-yellow-500" /> {t.subscription}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-t border-neutral-100 pt-4">
                <SubscriptionSettings />
              </div>
            </CardContent>
          </Card>
        </AnimatedCard>

        {/* Logout */}
        <AnimatedCard delay={240}>
          <Card className="border-neutral-200 rounded-lg shadow-none">
            <CardContent className="py-4">
              <Button
                variant="ghost"
                onClick={logout}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 w-full justify-start"
              >
                <Lock className="w-4 h-4 mr-2" /> {t.logout}
              </Button>
            </CardContent>
          </Card>
        </AnimatedCard>
      </div>
    </div>
  );
}

// ─── BUSINESS SETTINGS ───
function BusinessSettings() {
  const copy = useCopy(billingCopy).settings;
  const s = copy.business;
  const { data: settings } = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const update = trpc.settings.update.useMutation({
    onSuccess: () => { utils.settings.get.invalidate(); toast.success(s.saved); },
    onError: (err) => toast.error(err.message),
  });
  const [form, setForm] = useState({
    companyName: "Tu Placa", address: "", city: "", state: "", zipCode: "",
    addressType: "", unitNumber: "", phone: "", email: "", zelleEmail: "",
  });

  useEffect(() => {
    if (settings) setForm({
      companyName: settings.companyName || "Tu Placa",
      address: settings.address || "",
      city: settings.city || "",
      state: settings.state || "",
      zipCode: settings.zipCode || "",
      addressType: settings.addressType || "",
      unitNumber: settings.unitNumber || "",
      phone: settings.phone || "",
      email: settings.email || "",
      zelleEmail: settings.zelleEmail || "",
    });
  }, [settings]);

  const fullAddress = [form.address, form.city, form.state, form.zipCode].filter(Boolean).join(", ");

  return (
    <div className="p-6 lg:p-10 space-y-6 bg-white min-h-screen max-w-7xl mx-auto">
      <AnimatedPage>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-black flex items-center justify-center text-xl font-semibold text-white shrink-0">
            {(form.companyName || "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-medium text-black">{form.companyName || s.fallbackTitle}</h1>
            <p className="text-neutral-400 text-sm">{fullAddress || s.fallbackSubtitle}</p>
          </div>
        </div>
      </AnimatedPage>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mi Negocio — Profile Card */}
        <AnimatedCard delay={80} className="lg:col-span-2">
          <Card className="border-neutral-200 rounded-lg shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <CardHeader className="pb-2"><CardTitle className="text-black text-sm font-normal flex items-center gap-2"><Building2 className="w-4 h-4 text-neutral-400" /> {s.myBusiness}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Company Name */}
              <div><label className="text-xs text-neutral-400 mb-1 block">{s.companyName}</label><Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="border-neutral-200 text-sm" /></div>
              {/* Address row */}
              <div><label className="text-xs text-neutral-400 mb-1 block">{s.address}</label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="border-neutral-200 text-sm" /></div>
              {/* City / State / ZIP */}
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs text-neutral-400 mb-1 block">{s.city}</label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="border-neutral-200 text-sm" /></div>
                <div><label className="text-xs text-neutral-400 mb-1 block">{s.state}</label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="border-neutral-200 text-sm" maxLength={2} /></div>
                <div><label className="text-xs text-neutral-400 mb-1 block">{s.zip}</label><Input value={form.zipCode} onChange={(e) => setForm({ ...form, zipCode: e.target.value })} className="border-neutral-200 text-sm" /></div>
              </div>
              {/* Address Type — keys are the values saved on the server */}
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">{s.locationType}</label>
                <div className="grid grid-cols-4 gap-2">
                  {(["Casa", "Apartamento", "Oficina", "Tienda"] as const).map((key) => (
                    <button key={key} type="button" onClick={() => setForm({ ...form, addressType: key, unitNumber: key === "Casa" || key === "Tienda" ? "" : form.unitNumber })}
                      className={`py-2 px-1 rounded-lg border text-[11px] font-medium transition-all ${form.addressType === key ? "border-black bg-black text-white" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"}`}>
                      {s.addressTypes[key]}
                    </button>
                  ))}
                </div>
                {/* Unit number — only for Apartamento / Oficina */}
                {(form.addressType === "Apartamento" || form.addressType === "Oficina") && (
                  <div className="mt-2">
                    <label className="text-xs text-neutral-400 mb-1 block">
                      {form.addressType === "Apartamento" ? s.aptNumber : s.officeNumber}
                    </label>
                    <Input
                      value={form.unitNumber}
                      onChange={(e) => setForm({ ...form, unitNumber: e.target.value })}
                      className="border-neutral-200 text-sm"
                      placeholder={copy.example(form.addressType === "Apartamento" ? "4B" : "201")}
                    />
                  </div>
                )}
              </div>
              {/* Phone / Email */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-neutral-400 mb-1 block">{s.phone}</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="border-neutral-200 text-sm" /></div>
                <div><label className="text-xs text-neutral-400 mb-1 block">{s.businessEmail}</label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="border-neutral-200 text-sm" /></div>
              </div>
              {/* Language — applies immediately, not part of the saved form */}
              <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
                <span className="text-xs text-neutral-400">{copy.language}</span>
                <LanguageSwitcher />
              </div>
            </CardContent>
          </Card>
        </AnimatedCard>

        <AnimatedCard delay={160}>
          <Card className="border-neutral-200 rounded-lg shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <CardHeader className="pb-2"><CardTitle className="text-black text-sm font-normal flex items-center gap-2"><CreditCard className="w-4 h-4 text-neutral-400" /> {s.payments}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div><label className="text-xs text-neutral-400 mb-1 block">{s.zelleEmail}</label><Input value={form.zelleEmail} onChange={(e) => setForm({ ...form, zelleEmail: e.target.value })} className="border-neutral-200 text-sm" placeholder={s.zellePh} /></div>
            </CardContent>
          </Card>
        </AnimatedCard>

        <AnimatedCard delay={240}>
          <Card className="border-neutral-200 rounded-lg shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <CardContent className="py-4"><CloverSettings /></CardContent>
          </Card>
        </AnimatedCard>

        <AnimatedCard delay={320} className="lg:col-span-2">
          <Card className="border-neutral-200 rounded-lg shadow-none hover:border-neutral-300 hover:shadow-soft transition-[border-color,box-shadow] duration-200 ease-out-expo">
            <CardHeader className="pb-2"><CardTitle className="text-black text-sm font-normal flex items-center gap-2"><Crown className="w-4 h-4 text-yellow-500" /> {s.subscription}</CardTitle></CardHeader>
            <CardContent><div className="border-t border-neutral-100 pt-4"><SubscriptionSettings /></div></CardContent>
          </Card>
        </AnimatedCard>
      </div>
      <AnimatedPage delay={400}>
        <Button onClick={() => update.mutate(form)} disabled={update.isPending} className="bg-black hover:bg-neutral-800 text-white px-6">
          {update.isPending ? s.saving : s.save}
        </Button>
      </AnimatedPage>
    </div>
  );
}
