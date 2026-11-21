// /producto: the Negocio / Personal switch and the feature tour under it.
// Each area: what it does (3–4 bullets), which plans have it, and a mockup.
import { useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { Link } from "react-router";
import {
  ArrowDown, ArrowRight, Building2, Check, FileBarChart, FileText, Landmark, Repeat, ShoppingCart,
  Sparkles, Target, User, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";
import { SectionHeading } from "@/components/marketing/LandingSections";
import { BusinessPhonePreview, PhonePreview } from "@/components/marketing/Previews";
import {
  AssistantMock, BankMock, BudgetsMock, PersonalBankMock, PosMock, ReportsMock, SubscriptionsMock, TaxMock, TeamMock,
} from "@/components/marketing/site/ProductoMockups";
import { useCopy } from "@/i18n/useI18n";
import { productoCopy, type ProductoArea } from "@/i18n/copy/site/producto";

type Mode = "business" | "personal";
type Tier = "basic" | "pro" | "business";
type AreaConfig = { id: string; Icon: LucideIcon; plans: Tier[]; Visual: ComponentType };

function BusinessTax() { return <TaxMock mode="business" />; }
function PersonalTax() { return <TaxMock mode="personal" />; }
function BusinessAssistant() { return <AssistantMock mode="business" />; }
function PersonalAssistant() { return <AssistantMock mode="personal" />; }

const ALL: Tier[] = ["basic", "pro", "business"];

// Same order as the areas in the copy. Plans as in contracts/planFeatures.ts and the pricing cards.
const AREAS: Record<Mode, AreaConfig[]> = {
  business: [
    { id: "negocio-cobrar", Icon: ShoppingCart, plans: ALL, Visual: PosMock },
    { id: "negocio-banco", Icon: Landmark, plans: ALL, Visual: BankMock },
    { id: "negocio-reportes", Icon: FileBarChart, plans: ALL, Visual: ReportsMock },
    { id: "negocio-impuestos", Icon: FileText, plans: ["pro", "business"], Visual: BusinessTax },
    { id: "negocio-asistente", Icon: Sparkles, plans: ALL, Visual: BusinessAssistant },
    { id: "negocio-equipo", Icon: Users, plans: ["business"], Visual: TeamMock },
  ],
  personal: [
    { id: "personal-banco", Icon: Wallet, plans: ["pro"], Visual: PersonalBankMock },
    { id: "personal-suscripciones", Icon: Repeat, plans: ["pro"], Visual: SubscriptionsMock },
    { id: "personal-metas", Icon: Target, plans: ["pro"], Visual: BudgetsMock },
    { id: "personal-impuestos", Icon: FileText, plans: ["basic", "pro"], Visual: PersonalTax },
    { id: "personal-asistente", Icon: Sparkles, plans: ["basic", "pro"], Visual: PersonalAssistant },
  ],
};

const MODES: Mode[] = ["business", "personal"];
const MODE_ICONS: Record<Mode, LucideIcon> = { business: Building2, personal: User };

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

function PlanTag({ mode, plans }: { mode: Mode; plans: Tier[] }) {
  const t = useCopy(productoCopy).tour;
  const names = plans.map((p) => (mode === "personal" && p === "basic" ? `${t.planNames.basic} (${t.free})` : t.planNames[p]));
  return (
    <Link
      to="/precios"
      aria-label={`${t.includedIn} ${names.join(", ")}. ${t.seePrices}`}
      className={`group mt-8 inline-flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-600 shadow-sm transition-colors hover:border-blue-300 hover:text-slate-900 ${focusRing}`}
    >
      <span className="font-medium">{t.includedIn}</span>
      {names.map((n) => (
        <span key={n} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{n}</span>
      ))}
      <ArrowRight aria-hidden className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
    </Link>
  );
}

function AreaSection({ mode, area, config, index }: { mode: Mode; area: ProductoArea; config: AreaConfig; index: number }) {
  const flip = index % 2 === 1;
  const { Icon, Visual } = config;
  return (
    <article id={config.id} aria-labelledby={`${config.id}-title`} className={`scroll-mt-36 py-16 sm:py-24 ${flip ? "bg-slate-50" : "bg-white"}`}>
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <Reveal className={flip ? "lg:order-2" : ""}>
          <p className="flex items-center gap-2.5 text-sm font-semibold text-blue-600">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/20"><Icon className="h-[18px] w-[18px]" /></span>
            {area.nav}
          </p>
          <h3 id={`${config.id}-title`} className="mt-5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{area.title}</h3>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{area.text}</p>
          <ul className="mt-7 space-y-4">
            {area.bullets.map((b) => (
              <li key={b.t} className="flex gap-3">
                <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-3.5 w-3.5" /></span>
                <span className="text-[15px] leading-relaxed text-slate-700">
                  {b.t}
                  {b.plan && <span className="mt-1.5 block w-fit rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{b.plan}</span>}
                </span>
              </li>
            ))}
          </ul>
          <PlanTag mode={mode} plans={config.plans} />
        </Reveal>
        <Reveal delay={120} className={flip ? "lg:order-1" : ""}>
          <Visual />
        </Reveal>
      </div>
    </article>
  );
}

export function ProductoTour() {
  const c = useCopy(productoCopy);
  const t = c.tour;
  const [mode, setMode] = useState<Mode>("business");
  const tabRefs = useRef<Record<Mode, HTMLButtonElement | null>>({ business: null, personal: null });
  const panelTopRef = useRef<HTMLDivElement>(null);

  const select = (next: Mode) => {
    setMode(next);
    // Switching while deep in the tour: go back to the top of the new tour.
    const top = panelTopRef.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = MODES.indexOf(mode);
    let next: Mode | null = null;
    if (e.key === "ArrowRight") next = MODES[(i + 1) % MODES.length];
    else if (e.key === "ArrowLeft") next = MODES[(i - 1 + MODES.length) % MODES.length];
    else if (e.key === "Home") next = MODES[0];
    else if (e.key === "End") next = MODES[MODES.length - 1];
    if (!next) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  const areas = c[mode];
  const configs = AREAS[mode];
  const overview = t.overview[mode];

  return (
    <section id="recorrido" aria-labelledby="tour-title" className="scroll-mt-nav bg-slate-50 pt-24 sm:pt-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="tour-title" eyebrow={t.eyebrow} title={t.title} text={t.text} />
      </div>

      {/* The switch stays under the menu while you scroll through the tour. */}
      <div className="sticky top-[76px] z-30 mt-10 flex justify-center px-4">
        <div
          role="tablist"
          aria-label={t.tabsLabel}
          onKeyDown={onKeyDown}
          className="relative grid grid-cols-2 rounded-2xl bg-white/95 p-1 shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-200 backdrop-blur"
        >
          <span
            aria-hidden
            className="absolute bottom-1 left-0 top-1 w-[calc(50%-4px)] rounded-xl bg-slate-900 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
            style={{ transform: mode === "business" ? "translateX(4px)" : "translateX(calc(100% + 4px))" }}
          />
          {MODES.map((k) => {
            const Icon = MODE_ICONS[k];
            const active = mode === k;
            return (
              <button
                key={k}
                ref={(el) => { tabRefs.current[k] = el; }}
                id={`producto-tab-${k}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="producto-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => select(k)}
                className={`relative z-10 inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-7 sm:text-[15px] ${active ? "text-white" : "text-slate-600 hover:text-slate-900"}`}
              >
                <Icon aria-hidden className="h-4 w-4" /> {t.tabs[k]}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={panelTopRef} className="scroll-mt-36" />
      <div
        key={mode}
        id="producto-panel"
        role="tabpanel"
        aria-labelledby={`producto-tab-${mode}`}
        className="mt-14 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500"
      >
        {/* Overview: the app's home screen and a map of the areas below. */}
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:px-8">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{overview.title}</h3>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">{overview.text}</p>
            <p className="mt-9 text-sm font-semibold text-slate-500">{t.indexLabel}</p>
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {configs.map((cfg, i) => (
                <li key={cfg.id}>
                  <a
                    href={`#${cfg.id}`}
                    className={`group flex min-h-12 items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 text-[15px] font-semibold text-slate-800 ring-1 ring-slate-200 transition-colors hover:ring-blue-300 ${focusRing}`}
                  >
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><cfg.Icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">{areas[i].nav}</span>
                    <ArrowDown aria-hidden className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-y-0.5 group-hover:text-blue-600" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-auto w-full max-w-sm">
            {mode === "business" ? <BusinessPhonePreview /> : <PhonePreview />}
          </div>
        </div>

        {areas.map((area, i) => (
          <AreaSection key={configs[i].id} mode={mode} area={area} config={configs[i]} index={i} />
        ))}
      </div>
    </section>
  );
}
