import { useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowLeftRight, Bell, CreditCard, Home, Lock, MessageCircle, Search, Upload, User, type LucideIcon } from "lucide-react";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Skeleton } from "@/components/ui/skeleton";
import SubscriptionSettings from "@/components/SubscriptionSettings";
import { BusinessSection } from "@/components/settings/BusinessSection";
import { AccountSection, ConnectionsSection, DataSection, LanguageSection, NoticesSection, SecuritySection } from "@/components/settings/Sections";
import { INP } from "@/components/settings/styles";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { settingsCopy, type SettingsSection } from "@/i18n/copy/settings";

const SECTIONS: Record<"business" | "personal", SettingsSection[]> = {
  business: ["negocio", "cuenta", "conexiones", "plan", "avisos", "idioma", "seguridad", "datos"],
  personal: ["perfil", "conexiones", "plan", "avisos", "idioma", "seguridad", "datos"],
};
const ICON: Record<SettingsSection, LucideIcon> = {
  negocio: Home, perfil: User, cuenta: User, conexiones: ArrowLeftRight, plan: CreditCard, avisos: Bell, idioma: MessageCircle, seguridad: Lock, datos: Upload,
};

/** Lowercase without accents, so "telefono" finds "Teléfono". */
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * The prototype's settings screen: a list of sections on the left (a menu on the phone) and the
 * chosen one on the right. `?sec=plan` opens a section directly (links from locks and the assistant).
 */
export default function Settings() {
  const t = useCopy(settingsCopy);
  const { user } = useAuth();
  const mode = user?.modePreference === "personal" ? "personal" : "business";
  const sections = SECTIONS[mode];
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const status = trpc.subscription.status.useQuery(undefined, { staleTime: 30_000 });

  // Which section: the one asked for; coming back from Stripe or the "renew" overlay, the plan;
  // otherwise the first one, or the plan while there's no paid plan yet (the trial, or it ended).
  const asked = params.get("sec");
  const fromBilling = params.has("upgrade") || params.has("subscription") || params.has("renew");
  const paid = status.data ? status.data.active && status.data.status !== "trialing" : status.isError ? true : null;
  const sec: SettingsSection | null = asked && (sections as string[]).includes(asked) ? (asked as SettingsSection)
    : fromBilling ? "plan"
      : paid === null ? null : paid ? sections[0] : "plan";
  const go = (s: SettingsSection) => setParams({ sec: s }, { replace: true });

  const query = fold(q.trim());
  const shown = query ? sections.filter((s) => fold(`${t.sections[s]} ${t.keywords[s]}`).includes(query)) : sections;

  return (
    <AnimatedPage className="p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-[18px]">
          <h1 className="text-[22px] font-[750] tracking-tight text-slate-900">{t.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t.subtitle[mode]}</p>
        </header>

        <div className="grid items-start gap-3.5 md:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label={t.navLabel} className="grid gap-2 md:sticky md:top-2">
            {/* Phone: a menu */}
            <select aria-label={t.sectionLabel} value={sec ?? ""} onChange={(e) => go(e.target.value as SettingsSection)} className={cn(INP, "md:hidden")}>
              {sec === null && <option value="" disabled>…</option>}
              {sections.map((s) => <option key={s} value={s}>{t.sections[s]}</option>)}
            </select>
            {/* Desktop: search + the list */}
            <label className="hidden min-h-11 items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-100 px-3 text-slate-500 focus-within:border-blue-600 focus-within:bg-white focus-within:ring-[3px] focus-within:ring-blue-50 md:flex">
              <Search className="h-[17px] w-[17px] shrink-0" aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-500" />
            </label>
            <div className="hidden gap-0.5 md:grid">
              {shown.length === 0 ? <p className="p-2 text-[13px] text-slate-500">{t.noMatch(q.trim())}</p> : shown.map((s) => {
                const Icon = ICON[s];
                const on = s === sec;
                return (
                  <button key={s} type="button" onClick={() => go(s)} aria-current={on ? "true" : undefined}
                    className={cn("flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[9px] text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      on ? "bg-slate-100 font-[650] text-slate-900" : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900")}>
                    <Icon className={cn("h-[17px] w-[17px] shrink-0", on && "text-blue-600")} aria-hidden />{t.sections[s]}
                  </button>
                );
              })}
            </div>
          </nav>

          <section className="min-w-0 rounded-[14px] border border-slate-200 bg-white p-4" aria-label={sec ? t.sections[sec] : t.title}>
            {sec === null ? (
              <div className="space-y-3" role="status" aria-label={t.title}><Skeleton className="h-6 w-40" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-10 w-48" /></div>
            ) : sec === "negocio" ? <BusinessSection />
              : sec === "cuenta" || sec === "perfil" ? <AccountSection mode={mode} onLanguage={() => go("idioma")} />
                : sec === "conexiones" ? <ConnectionsSection mode={mode} />
                  : sec === "plan" ? <SubscriptionSettings />
                    : sec === "avisos" ? <NoticesSection mode={mode} />
                      : sec === "idioma" ? <LanguageSection />
                        : sec === "seguridad" ? <SecuritySection />
                          : <DataSection mode={mode} />}
          </section>
        </div>
      </div>
    </AnimatedPage>
  );
}
