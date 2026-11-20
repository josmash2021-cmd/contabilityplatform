import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight, Check, ShieldCheck, Lock, Eye, CreditCard, Unplug, Landmark, Layers, Zap, FileBarChart,
  ShoppingCart, Users, Receipt, Scale, Smartphone, Wallet, Tags, Tv, Target, CalendarCheck, Building2, User,
  UserPlus, Link2, LineChart, Sparkles,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { DashboardPreview, PhonePreview, ReportPreview } from "@/components/marketing/Previews";
import { PLANS, TRIAL_DAYS, annualPerMonth, type PlanKey } from "@/components/marketing/content";

const primaryCta =
  "group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/20 transition-all duration-200 hover:bg-blue-500 hover:shadow-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060B18]";

function SectionHeading({ eyebrow, title, text, id, dark = false }: { eyebrow: string; title: string; text?: string; id?: string; dark?: boolean }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className={`text-sm font-semibold ${dark ? "text-blue-400" : "text-blue-600"}`}>{eyebrow}</p>
      <h2 id={id} className={`mt-3 text-3xl font-bold tracking-tight sm:text-4xl ${dark ? "text-white" : "text-slate-900"}`}>{title}</h2>
      {text && <p className={`mt-4 text-lg leading-relaxed ${dark ? "text-slate-400" : "text-slate-600"}`}>{text}</p>}
    </Reveal>
  );
}

// ── Hero ──
function Hero() {
  return (
    <section className="relative overflow-hidden bg-[#060B18] pb-20 pt-32 sm:pb-28 sm:pt-36 lg:pt-40" aria-labelledby="hero-title">
      <div className="bg-grid-dark pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[120px]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:px-8">
        <div className="text-center lg:text-left">
          <p className="animate-hero-in inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3.5 py-1.5 text-xs font-medium text-blue-200">
            <Sparkles className="h-3.5 w-3.5" /> Contabilidad con inteligencia artificial
          </p>
          <h1 id="hero-title" className="animate-hero-in mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white [animation-delay:80ms] sm:text-5xl lg:text-[3.6rem]">
            Tu contabilidad en orden,{" "}
            <span className="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">siempre al día.</span>
          </h1>
          <p className="animate-hero-in mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300 [animation-delay:160ms] lg:mx-0">
            Ai Aethel conecta tu banco, organiza automáticamente tus ingresos y gastos, y te entrega reportes claros para tomar mejores decisiones. Para tu negocio y para tus finanzas personales.
          </p>
          <div className="animate-hero-in mt-9 flex flex-col items-center gap-3 [animation-delay:240ms] sm:flex-row sm:justify-center lg:justify-start">
            <Link to="/register" className={primaryCta}>
              Empieza gratis
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 px-6 text-[15px] font-medium text-white transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              Ver cómo funciona
            </a>
          </div>
          <ul className="animate-hero-in mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400 [animation-delay:320ms] lg:justify-start">
            {[`${TRIAL_DAYS} días gratis`, "Sin tarjeta de crédito", "Cancela cuando quieras"].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5"><Check className="h-4 w-4 text-emerald-400" />{t}</li>
            ))}
          </ul>
        </div>

        <div className="animate-hero-in mx-auto w-full max-w-xl [animation-delay:200ms] lg:max-w-none">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}

// ── Trust strip ──
function TrustStrip() {
  const items = [
    { icon: Landmark, title: "Conexión bancaria con Plaid", text: "La infraestructura que usan apps financieras líderes" },
    { icon: CreditCard, title: "Pagos procesados por Stripe", text: "Nunca guardamos los datos de tu tarjeta" },
    { icon: Eye, title: "Acceso de solo lectura", text: "Podemos ver tus movimientos, no mover tu dinero" },
    { icon: Lock, title: "Conexión cifrada", text: "Toda la información viaja protegida por HTTPS" },
  ];
  return (
    <section className="border-b border-slate-200 bg-white" aria-label="Seguridad y confianza">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {items.map((it, i) => (
          <Reveal key={it.title} delay={i * 70} className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700"><it.icon className="h-5 w-5" /></span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{it.title}</p>
              <p className="mt-0.5 text-sm text-slate-500">{it.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ── Value props ──
function ValueProps() {
  const items = [
    { icon: Layers, title: "Todo en un solo lugar", text: "Ventas, gastos, clientes y cuentas bancarias en un mismo panel. Se acabaron las hojas de cálculo sueltas." },
    { icon: Zap, title: "Automático de verdad", text: "Tus movimientos bancarios llegan solos y se clasifican por categoría. Tú solo revisas." },
    { icon: FileBarChart, title: "Reportes que se entienden", text: "Estado de resultados y balance general claros, explicados sin jerga contable." },
  ];
  return (
    <section className="bg-white py-24 sm:py-28" aria-labelledby="value-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="value-title"
          eyebrow="Por qué Ai Aethel"
          title="Menos tiempo con papeles, más claridad sobre tu dinero"
          text="Llevar las cuentas no debería quitarte horas cada semana. Ai Aethel hace el trabajo repetitivo para que tú te enfoques en decidir."
        />
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 90}>
              <div className="group h-full rounded-2xl border border-slate-200 bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white"><it.icon className="h-5 w-5" /></span>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">{it.title}</h3>
                <p className="mt-2 leading-relaxed text-slate-600">{it.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Product (business / personal tabs) ──
const productTabs = {
  business: {
    label: "Para negocios",
    icon: Building2,
    title: "Cobra, registra y entiende los números de tu negocio",
    text: "Desde la primera venta del día hasta el reporte de fin de mes, todo queda registrado y ordenado.",
    features: [
      { icon: ShoppingCart, title: "Punto de venta", text: "Cobra en efectivo, Zelle o tarjeta y registra cada venta al instante." },
      { icon: Users, title: "Clientes y servicios", text: "Tu catálogo y tu base de clientes, con importación desde Excel." },
      { icon: Receipt, title: "Control de gastos", text: "Registra gastos por categoría y método de pago." },
      { icon: Landmark, title: "Banco conectado", text: "Tus cuentas sincronizadas y tus movimientos siempre actualizados." },
      { icon: FileBarChart, title: "Reportes contables", text: "Estado de resultados, balance general y libro diario." },
      { icon: Scale, title: "Conciliación bancaria", text: "Compara tu saldo del banco con tus registros." },
    ],
  },
  personal: {
    label: "Para ti",
    icon: User,
    title: "Descubre a dónde va tu dinero cada mes",
    text: "Conecta tu banco una vez y obtén una vista clara de tus gastos, tus suscripciones y tus metas.",
    features: [
      { icon: Wallet, title: "Movimientos automáticos", text: "Todo lo que entra y sale de tu cuenta, sin capturar nada a mano." },
      { icon: Tags, title: "Categorías inteligentes", text: "Comida, hogar, transporte: cada gasto en su lugar." },
      { icon: Tv, title: "Detector de suscripciones", text: "Encuentra cobros recurrentes y guías para cancelarlos." },
      { icon: Target, title: "Metas de ahorro", text: "Define una meta y sigue tu avance mes a mes." },
      { icon: CalendarCheck, title: "Resumen mensual", text: "Tus ingresos y gastos del mes de un vistazo." },
      { icon: Smartphone, title: "Siempre a la mano", text: "Desde tu computadora o tu celular, cuando lo necesites." },
    ],
  },
} as const;

function Product() {
  const [tab, setTab] = useState<keyof typeof productTabs>("business");
  const t = productTabs[tab];
  return (
    <section id="producto" className="scroll-mt-nav bg-slate-50 py-24 sm:py-28" aria-labelledby="product-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="product-title" eyebrow="Producto" title="Una plataforma, dos formas de usarla" text="Elige el modo que va contigo al crear tu cuenta: Negocio o Personal." />

        <Reveal className="mt-10 flex justify-center">
          <div role="tablist" aria-label="Tipo de cuenta" className="relative grid grid-cols-2 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <span
              aria-hidden
              className="absolute bottom-1 left-0 top-1 w-[calc(50%-4px)] rounded-lg bg-slate-900 transition-transform duration-300 ease-out"
              style={{ transform: tab === "business" ? "translateX(4px)" : "translateX(calc(100% + 4px))" }}
            />
            {(Object.keys(productTabs) as Array<keyof typeof productTabs>).map((k) => {
              const Icon = productTabs[k].icon;
              const active = tab === k;
              return (
                <button
                  key={k}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(k)}
                  className={`relative z-10 inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-7 ${active ? "text-white" : "text-slate-600 hover:text-slate-900"}`}
                >
                  <Icon className="h-4 w-4" /> {productTabs[k].label}
                </button>
              );
            })}
          </div>
        </Reveal>

        <div key={tab} role="tabpanel" className="mt-14 grid items-center gap-14 animate-in fade-in slide-in-from-bottom-2 duration-500 lg:grid-cols-2">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t.title}</h3>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">{t.text}</p>
            <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {t.features.map((f) => (
                <div key={f.title} className="flex gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200"><f.icon className="h-5 w-5" /></span>
                  <div>
                    <p className="font-semibold text-slate-900">{f.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-lg">{tab === "business" ? <ReportPreview /> : <PhonePreview />}</div>
        </div>
      </div>
    </section>
  );
}

// ── How it works ──
function HowItWorks() {
  const steps = [
    { icon: UserPlus, title: "Crea tu cuenta", text: "Elige Negocio o Personal. Toma un par de minutos y no te pedimos tarjeta." },
    { icon: Link2, title: "Conecta tu banco", text: "Vincula tus cuentas de forma segura con Plaid. Acceso de solo lectura." },
    { icon: LineChart, title: "Recibe tus números", text: "Tus movimientos se organizan solos y tus reportes se actualizan automáticamente." },
  ];
  return (
    <section id="como-funciona" className="scroll-mt-nav bg-white py-24 sm:py-28" aria-labelledby="how-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="how-title" eyebrow="Cómo funciona" title="Empieza en tres pasos" text="Sin instalaciones ni configuraciones complicadas." />
        <div className="relative mt-16">
          <div aria-hidden className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent md:block" />
          <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
            {steps.map((s, i) => (
              <li key={s.title} className="text-center">
                <Reveal delay={i * 120}>
                  <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20">
                    <s.icon className="h-6 w-6" />
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold ring-4 ring-white">{i + 1}</span>
                  </span>
                  <h3 className="mt-6 text-lg font-semibold text-slate-900">{s.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs leading-relaxed text-slate-600">{s.text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

// ── Security ──
function Security() {
  const points = [
    { icon: Landmark, title: "Tus credenciales nunca pasan por nosotros", text: "Inicias sesión en tu banco dentro de Plaid. Ai Aethel no ve ni guarda tu usuario o contraseña bancaria." },
    { icon: Eye, title: "Solo lectura", text: "La conexión permite ver movimientos y saldos. Nadie puede hacer pagos ni transferencias desde Ai Aethel." },
    { icon: CreditCard, title: "Pagos con Stripe", text: "Tu suscripción se paga en la plataforma segura de Stripe. No almacenamos datos de tarjetas." },
    { icon: Unplug, title: "Tú tienes el control", text: "Desconecta tu banco cuando quieras desde la sección Banco." },
  ];
  return (
    <section id="seguridad" className="scroll-mt-nav relative overflow-hidden bg-[#060B18] py-24 sm:py-28" aria-labelledby="security-title">
      <div className="bg-grid-dark pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <Reveal>
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-400/20"><ShieldCheck className="h-7 w-7" /></span>
          <p className="mt-6 text-sm font-semibold text-blue-400">Seguridad</p>
          <h2 id="security-title" className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Tu información financiera, protegida</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-400">
            Trabajamos con proveedores especializados en seguridad financiera para que conectar tu banco y pagar tu plan sea tan seguro como usar la app de tu banco.
          </p>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 80}>
              <div className="h-full rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.05]">
                <p.icon className="h-5 w-5 text-blue-400" />
                <h3 className="mt-4 font-semibold text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing ──
function Pricing() {
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const order: PlanKey[] = ["personal", "business"];
  return (
    <section id="precios" className="scroll-mt-nav bg-slate-50 py-24 sm:py-28" aria-labelledby="pricing-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="pricing-title"
          eyebrow="Precios"
          title="Precios simples. Empieza gratis."
          text={`Todos los planes incluyen ${TRIAL_DAYS} días de prueba con acceso completo. Sin tarjeta para empezar.`}
        />

        <Reveal className="mt-10 flex flex-col items-center">
          <div role="radiogroup" aria-label="Periodo de facturación" className="relative grid grid-cols-2 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            <span
              aria-hidden
              className="absolute bottom-1 left-0 top-1 w-[calc(50%-4px)] rounded-lg bg-slate-900 transition-transform duration-300 ease-out"
              style={{ transform: billing === "monthly" ? "translateX(4px)" : "translateX(calc(100% + 4px))" }}
            />
            {(["monthly", "annual"] as const).map((b) => (
              <button
                key={b}
                role="radio"
                aria-checked={billing === b}
                onClick={() => setBilling(b)}
                className={`relative z-10 inline-flex h-11 items-center justify-center gap-2 rounded-lg px-6 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${billing === b ? "text-white" : "text-slate-600 hover:text-slate-900"}`}
              >
                {b === "monthly" ? "Mensual" : "Anual"}
                {b === "annual" && (
                  <span className={`hidden whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline-block ${billing === "annual" ? "bg-emerald-400/20 text-emerald-300" : "bg-emerald-50 text-emerald-700"}`}>2 meses gratis</span>
                )}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs font-medium text-emerald-700 sm:hidden">El plan anual incluye 2 meses gratis</p>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-2">
          {order.map((key, i) => {
            const p = PLANS[key];
            const featured = key === "business";
            const price = billing === "monthly" ? p.monthly : p.annual;
            return (
              <Reveal key={key} delay={i * 100}>
                <div
                  className={`relative flex h-full flex-col rounded-3xl p-8 transition-all duration-300 hover:-translate-y-1 ${
                    featured
                      ? "bg-[#0B1224] text-white shadow-[0_30px_70px_-25px_rgba(2,6,23,0.7)] ring-1 ring-white/10"
                      : "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)]"
                  }`}
                >
                  {featured && (
                    <span className="absolute -top-3 right-8 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-md">El más completo</span>
                  )}
                  <div className="flex items-center gap-2.5">
                    {featured ? <Building2 className="h-5 w-5 text-blue-400" /> : <User className="h-5 w-5 text-blue-600" />}
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                  </div>
                  <p className={`mt-2 text-sm ${featured ? "text-slate-400" : "text-slate-600"}`}>{p.tagline}</p>

                  <div className="mt-7 flex items-baseline gap-1.5">
                    <span className="text-5xl font-bold tracking-tight tabular-nums">${price}</span>
                    <span className={featured ? "text-slate-400" : "text-slate-500"}>{billing === "monthly" ? "/mes" : "/año"}</span>
                  </div>
                  <p className={`mt-2 h-5 text-sm ${featured ? "text-emerald-300" : "text-emerald-700"}`}>
                    {billing === "annual" ? `Equivale a ${annualPerMonth(p.annual)} al mes` : ""}
                  </p>

                  <Link
                    to={`/register?mode=${key}`}
                    className={`group mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 ${
                      featured ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Empezar {TRIAL_DAYS} días gratis
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>

                  <ul className="mt-8 space-y-3.5 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-3">
                        <Check className={`mt-0.5 h-4 w-4 shrink-0 ${featured ? "text-emerald-400" : "text-emerald-600"}`} />
                        <span className={featured ? "text-slate-300" : "text-slate-700"}>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
        <Reveal className="mt-10 text-center text-sm text-slate-500">
          Precios en dólares estadounidenses (USD). Al terminar la prueba eliges tu plan; no hay cobros automáticos.
        </Reveal>
      </div>
    </section>
  );
}

// ── FAQ ──
const faqs = [
  {
    q: "¿Cómo funciona la prueba gratis?",
    a: `Al crear tu cuenta tienes ${TRIAL_DAYS} días de acceso completo a todas las funciones de tu plan. No te pedimos tarjeta. Cuando termina, eliges el plan que prefieras para seguir usando Ai Aethel.`,
  },
  {
    q: "¿Se me cobrará algo al terminar la prueba?",
    a: "No. Como no registras una tarjeta durante la prueba, no hay cobros automáticos. Solo pagas si decides suscribirte.",
  },
  {
    q: "¿Es seguro conectar mi banco?",
    a: "Sí. La conexión se hace a través de Plaid: inicias sesión en tu banco dentro de Plaid y Ai Aethel nunca ve tu usuario ni tu contraseña. El acceso es de solo lectura, así que nadie puede mover dinero desde la plataforma.",
  },
  {
    q: "¿Qué bancos puedo conectar?",
    a: "Puedes conectar la mayoría de bancos y cooperativas de crédito de Estados Unidos a través de Plaid.",
  },
  {
    q: "¿Cuál es la diferencia entre Negocio y Personal?",
    a: "Negocio incluye punto de venta, clientes, servicios, gastos y reportes contables como el estado de resultados y el balance general. Personal está pensado para tus finanzas del día a día: movimientos, categorías, suscripciones y metas de ahorro.",
  },
  {
    q: "¿Necesito saber de contabilidad?",
    a: "No. Ai Aethel organiza tus números por ti y te los muestra en reportes fáciles de leer. Si trabajas con un contador, puedes exportarle tus reportes.",
  },
  {
    q: "¿Puedo exportar mis reportes?",
    a: "Sí. Puedes exportar tus reportes contables en formato CSV, que se abre directamente en Excel o Google Sheets.",
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. Puedes cancelar tu suscripción en cualquier momento desde Ajustes, sin llamadas ni trámites.",
  },
];

function Faq() {
  return (
    <section id="preguntas" className="scroll-mt-nav bg-white py-24 sm:py-28" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="faq-title" eyebrow="Preguntas frecuentes" title="Resolvemos tus dudas" />
        <Reveal className="mt-12">
          <Accordion type="single" collapsible className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-6">
            {faqs.map((f, i) => (
              <AccordionItem key={f.q} value={`faq-${i}`} className="border-0">
                <AccordionTrigger className="py-5 text-left text-base font-semibold text-slate-900 hover:no-underline">{f.q}</AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-relaxed text-slate-600">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

// ── Final CTA ──
function FinalCta() {
  return (
    <section className="bg-white pb-24 sm:pb-28" aria-labelledby="cta-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-[#0B1224] px-6 py-16 text-center sm:px-16">
            <div className="pointer-events-none absolute -bottom-32 left-1/2 h-72 w-[700px] -translate-x-1/2 rounded-full bg-blue-600/30 blur-[100px]" />
            <div className="relative">
              <h2 id="cta-title" className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Empieza hoy. Tus primeros {TRIAL_DAYS} días son gratis.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">Crea tu cuenta en minutos y ten tus finanzas en orden desde esta semana.</p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/register" className={primaryCta}>
                  Crear mi cuenta gratis
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link to="/login" className="inline-flex h-12 items-center justify-center rounded-xl px-6 text-[15px] font-medium text-slate-300 transition-colors hover:text-white">
                  Ya tengo cuenta
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="font-brand min-h-screen bg-white text-slate-900">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow">
        Saltar al contenido
      </a>
      <MarketingNav />
      <main id="contenido">
        <Hero />
        <TrustStrip />
        <ValueProps />
        <Product />
        <HowItWorks />
        <Security />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
