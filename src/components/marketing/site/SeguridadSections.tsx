// Sections of the /seguridad page. Words live in src/i18n/copy/site/seguridad.ts;
// every claim there is backed by the code (see the notes in that file).
import { Link } from "react-router";
import {
  ArrowLeftRight, ArrowRight, Ban, BadgeDollarSign, Bot, Calculator, CalendarX, Check, CircleCheck, CreditCard, Crown, Eye, FileLock2,
  KeyRound, Landmark, Lock, LogOut, ShieldCheck, SlidersHorizontal, Trash2, Unplug, UserMinus, UserRound, Users, X, type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/marketing/Reveal";
import { SectionHeading } from "@/components/marketing/LandingSections";
import type { SeguridadCopy, SeguridadLevel } from "@/i18n/copy/site/seguridad";

type C = SeguridadCopy;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

// ── Hero visual: a calm summary card of what protects each thing ──
const heroIcons: LucideIcon[] = [Landmark, CreditCard, FileLock2, KeyRound, Users];

export function SeguridadHeroVisual({ c }: { c: C["hero"]["visual"] }) {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div aria-hidden className="absolute -inset-4 rounded-[2.5rem] bg-gradient-to-br from-emerald-500/20 via-blue-500/10 to-transparent blur-2xl" />
      <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_30px_80px_-30px_rgba(2,6,23,0.9)] backdrop-blur sm:p-7">
        <div className="flex items-center gap-3.5">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30">
            <span aria-hidden className="absolute inset-0 rounded-2xl bg-emerald-400/20 motion-safe:animate-pulse" />
            <ShieldCheck className="relative h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-white">{c.title}</p>
            <p className="text-sm text-slate-400">{c.subtitle}</p>
          </div>
        </div>
        <ul aria-label={c.label} className="mt-6 space-y-2.5">
          {c.rows.map((row, i) => {
            const Icon = heroIcons[i] ?? ShieldCheck;
            return (
              <li
                key={row.title}
                className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3.5 py-3 ring-1 ring-white/[0.06] motion-safe:animate-hero-in sm:px-4"
                style={{ animationDelay: `${200 + i * 90}ms` }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-slate-400">{row.title}</span>
                  <span className="block text-[15px] font-medium leading-snug text-white">{row.value}</span>
                </span>
                <CircleCheck className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
              </li>
            );
          })}
        </ul>
        <p className="mt-5 flex items-center gap-2 text-sm text-slate-400">
          <Lock className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          {c.footer}
        </p>
      </div>
    </div>
  );
}

// ── Trust strip: who handles the sensitive parts ──
type Mark = { logo: string; w: number; h: number } | { Icon: LucideIcon };
const trustMarks: Mark[] = [
  { logo: "/brands/plaid.svg", w: 55, h: 21 },
  { logo: "/brands/stripe.svg", w: 50, h: 21 },
  { Icon: Lock },
  { Icon: FileLock2 },
];

export function SeguridadTrust({ c }: { c: C["trust"] }) {
  return (
    <section className="border-b border-slate-200 bg-white" aria-label={c.label}>
      <ul className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {c.items.map((it, i) => {
          const m = trustMarks[i];
          return (
            <li key={it.title}>
              <Reveal delay={i * 70} className="flex items-start gap-3.5">
                <span className="flex h-11 w-[72px] shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-700 ring-1 ring-slate-200">
                  {m && "logo" in m ? (
                    <img src={m.logo} alt="" width={m.w} height={m.h} className="block object-contain" style={{ width: m.w, height: m.h }} />
                  ) : m ? (
                    <m.Icon className="h-5 w-5" aria-hidden />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{it.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{it.text}</p>
                </div>
              </Reveal>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Pillars: what we do, each with its "how it works" ──
const pillarIcons: LucideIcon[] = [Landmark, CreditCard, FileLock2, KeyRound, Users, SlidersHorizontal];

export function SeguridadPillars({ c }: { c: C["pillars"] }) {
  return (
    <section className="bg-slate-50 py-24 sm:py-28" aria-labelledby="pillars-title">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="pillars-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />
        <ul className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {c.items.map((p, i) => {
            const Icon = pillarIcons[i] ?? ShieldCheck;
            return (
              <li key={p.title}>
                <Reveal delay={(i % 3) * 90} className="h-full">
                  <article className="flex h-full flex-col rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200 transition-shadow duration-300 hover:shadow-[0_18px_40px_-20px_rgba(15,23,42,0.25)] sm:p-8">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                      <Icon className="h-6 w-6" aria-hidden />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-slate-900">{p.title}</h3>
                    <p className="mt-2 leading-relaxed text-slate-600">{p.text}</p>
                    <div className="mt-6 border-t border-slate-100 pt-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{c.how}</p>
                      <ul className="mt-3 space-y-3">
                        {p.points.map((pt) => (
                          <li key={pt} className="flex gap-3 text-[15px] leading-relaxed text-slate-700">
                            <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ── Who can see what: a real table, with a symbol and words in every cell ──
const roleIcons: LucideIcon[] = [Crown, UserRound, Calculator];
const levelStyle: Record<SeguridadLevel, { Icon: LucideIcon; chip: string }> = {
  yes: { Icon: Check, chip: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  read: { Icon: Eye, chip: "bg-blue-50 text-blue-700 ring-blue-200" },
  no: { Icon: X, chip: "bg-slate-100 text-slate-500 ring-slate-200" },
};

function LevelIcon({ level }: { level: SeguridadLevel }) {
  const { Icon, chip } = levelStyle[level];
  return (
    <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ${chip}`}>
      <Icon className="h-4 w-4" strokeWidth={2.5} />
    </span>
  );
}

export function SeguridadAccess({ c }: { c: C["access"] }) {
  return (
    <section id="quien-ve" className="scroll-mt-nav bg-white py-24 sm:py-28" aria-labelledby="access-title">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="access-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />
        <Reveal className="mt-14">
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full table-fixed border-collapse text-left">
              <caption className="sr-only">{c.caption}</caption>
              <colgroup>
                <col className="w-[34%] sm:w-[37%]" />
                <col />
                <col />
                <col />
              </colgroup>
              <thead className="bg-slate-50">
                <tr>
                  <th scope="col" className="px-3 py-4 align-bottom text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-6">
                    {c.colArea}
                  </th>
                  {c.roles.map((r, i) => {
                    const Icon = roleIcons[i] ?? UserRound;
                    return (
                      <th key={r.name} scope="col" className="px-1 py-4 text-center align-bottom sm:px-3">
                        <span className="flex flex-col items-center gap-1.5">
                          <span aria-hidden className="hidden h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 sm:flex">
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="text-[13px] font-semibold text-slate-900 sm:text-sm">{r.name}</span>
                          <span className="hidden text-xs font-normal text-slate-500 sm:block">{r.note}</span>
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {c.rows.map((row) => (
                  <tr key={row.area} className="transition-colors hover:bg-slate-50/60">
                    <th scope="row" className="px-3 py-4 text-[13px] font-medium leading-snug text-slate-900 sm:px-6 sm:text-[15px]">
                      {row.area}
                    </th>
                    {row.cells.map(([level, label], i) => (
                      <td key={i} className="px-1 py-4 text-center sm:px-3">
                        <span className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-center sm:gap-2">
                          <LevelIcon level={level} />
                          <span className={`text-xs leading-tight sm:text-sm ${level === "no" ? "text-slate-500" : "text-slate-700"}`}>{label}</span>
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <Reveal className="mt-6">
          <h3 className="sr-only">{c.legendLabel}</h3>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-slate-600">
            {(Object.keys(c.legend) as SeguridadLevel[]).map((lvl) => (
              <li key={lvl} className="inline-flex items-center gap-2">
                <LevelIcon level={lvl} />
                {c.legend[lvl]}
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-relaxed text-slate-500">{c.footnote}</p>
        </Reveal>
      </div>
    </section>
  );
}

// ── What we never do ──
const neverIcons: LucideIcon[] = [KeyRound, ArrowLeftRight, CreditCard, CalendarX, BadgeDollarSign, Bot];

export function SeguridadNever({ c }: { c: C["never"] }) {
  return (
    <section className="relative overflow-hidden bg-[#060B18] py-24 sm:py-28" aria-labelledby="never-title">
      <div aria-hidden className="bg-grid-dark pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/20">
            <Ban className="h-7 w-7" aria-hidden />
          </span>
          <p className="mt-6 text-sm font-semibold text-blue-400">{c.eyebrow}</p>
          <h2 id="never-title" className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{c.title}</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-400">{c.text}</p>
        </Reveal>
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {c.items.map((it, i) => {
            const Icon = neverIcons[i] ?? Ban;
            return (
              <li key={it.title}>
                <Reveal delay={(i % 3) * 80} className="h-full">
                  <div className="h-full rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition-colors duration-300 hover:border-white/20 hover:bg-white/[0.05]">
                    <span aria-hidden className="relative inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.06] text-slate-300">
                      <Icon className="h-5 w-5" />
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white ring-2 ring-[#060B18]">
                        <X className="h-3 w-3" strokeWidth={3} />
                      </span>
                    </span>
                    <h3 className="mt-5 font-semibold text-white">
                      <span className="sr-only">{c.srPrefix} </span>
                      {it.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{it.text}</p>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ── If something doesn't look right: what you can do yourself, and where ──
const controlIcons: LucideIcon[] = [Unplug, UserMinus, LogOut, Trash2];

export function SeguridadControl({ c }: { c: C["control"] }) {
  return (
    <section className="bg-white py-24 sm:py-28" aria-labelledby="control-title">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading id="control-title" eyebrow={c.eyebrow} title={c.title} text={c.text} />
        <ul className="mt-14 grid gap-6 md:grid-cols-2">
          {c.items.map((it, i) => {
            const Icon = controlIcons[i] ?? SlidersHorizontal;
            return (
              <li key={it.title}>
                <Reveal delay={(i % 2) * 90} className="h-full">
                  <article className="flex h-full flex-col rounded-3xl p-7 ring-1 ring-slate-200 sm:p-8">
                    <div className="flex items-center gap-3.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <h3 className="text-lg font-semibold text-slate-900">{it.title}</h3>
                    </div>
                    <p className="mt-4 leading-relaxed text-slate-600">{it.text}</p>
                    <div className="mt-auto pt-5">
                      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{c.whereLabel}</p>
                        <ul className="mt-2 space-y-1.5">
                          {it.where.map((w) => (
                            <li key={w} className="flex gap-2.5 text-[15px] leading-relaxed text-slate-800">
                              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                              <span>{w}</span>
                            </li>
                          ))}
                        </ul>
                        {it.link && (
                          <Link to="/privacy" className={`mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[15px] font-semibold text-blue-700 hover:text-blue-800 ${focusRing}`}>
                            {it.link} <ArrowRight className="h-4 w-4" aria-hidden />
                          </Link>
                        )}
                      </div>
                    </div>
                  </article>
                </Reveal>
              </li>
            );
          })}
        </ul>

        <Reveal className="mt-10">
          <div className="flex flex-col gap-6 rounded-3xl bg-slate-50 p-7 ring-1 ring-slate-200 sm:p-10 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                <ShieldCheck className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{c.privacy.title}</h3>
                <p className="mt-1.5 max-w-xl leading-relaxed text-slate-600">{c.privacy.text}</p>
              </div>
            </div>
            <Link
              to="/privacy"
              className={`group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-slate-800 ${focusRing}`}
            >
              {c.privacy.cta}
              <ArrowRight className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
