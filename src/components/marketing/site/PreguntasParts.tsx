// Pieces of the /preguntas page: the search box, the category links, each category's
// questions, the "no results" state and the closing help block.
// Words live in src/i18n/copy/site/preguntas.ts; search logic in ./PreguntasSearch.ts.
import { Fragment, type FormEvent, type RefObject } from "react";
import { Link } from "react-router";
import {
  ArrowRight, CreditCard, FileText, Landmark, MessageCircleQuestion, Rocket, Search, SearchX, ShieldCheck, Sparkles, Users, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "@/components/marketing/Reveal";
import { highlightSegments, type PreguntasMatch } from "@/components/marketing/site/PreguntasSearch";
import type { PreguntasCategory, PreguntasCategoryId, PreguntasCopy } from "@/i18n/copy/site/preguntas";

type C = PreguntasCopy;

const preguntasIcons: Record<PreguntasCategoryId, LucideIcon> = {
  start: Rocket,
  plans: CreditCard,
  bank: Landmark,
  taxes: FileText,
  assistant: Sparkles,
  team: Users,
  security: ShieldCheck,
  personal: Wallet,
};

/** Marks the words being searched for. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightSegments(text, terms).map((s, i) =>
        s.hit ? (
          <mark key={i} className="rounded-[3px] bg-amber-200/80 px-0.5 text-inherit">{s.text}</mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}

// ── Search box (in the dark hero) ──
export function PreguntasSearchBox({
  c, query, found, searching, inputRef, onQuery, onClear, onSubmit,
}: {
  c: C["search"];
  query: string;
  found: number;
  searching: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onQuery: (value: string) => void;
  onClear: () => void;
  /** Enter: go to the results. */
  onSubmit: () => void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form role="search" onSubmit={submit} className="mx-auto mt-10 w-full max-w-2xl text-left">
      <label htmlFor="faq-search" className="sr-only">{c.label}</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          ref={inputRef}
          id="faq-search"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={c.placeholder}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-describedby="faq-search-status"
          className="h-14 w-full rounded-2xl border-0 bg-white pl-12 pr-14 text-base text-slate-900 shadow-xl shadow-black/30 placeholder:text-slate-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/70 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            onClick={onClear}
            aria-label={c.clear}
            className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>
      <p id="faq-search-status" role="status" className="mt-3 min-h-5 text-center text-sm text-slate-300">
        {searching ? c.found(found) : ""}
      </p>
    </form>
  );
}

// ── Links to each category: chips in the hero, a sticky list on large screens ──
export function PreguntasCategoryLinks({
  categories, counts, searching, label, countLabel, variant,
}: {
  categories: PreguntasCategory[];
  /** Questions shown per category right now (0 hides the link's target). */
  counts: Partial<Record<PreguntasCategoryId, number>>;
  searching: boolean;
  label: string;
  countLabel: (n: number) => string;
  variant: "chips" | "list";
}) {
  const chips = variant === "chips";
  return (
    <nav aria-label={label} className={chips ? "mt-4" : ""}>
      {!chips && <p className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>}
      <ul className={chips ? "flex flex-wrap justify-center gap-2" : "mt-3 space-y-1"}>
        {categories.map((cat) => {
          const n = counts[cat.id] ?? 0;
          const Icon = preguntasIcons[cat.id];
          const showCount = chips ? searching : true;
          const inner = (
            <>
              <Icon className={chips ? "hidden h-4 w-4 shrink-0 sm:block" : "h-[18px] w-[18px] shrink-0 text-slate-400"} aria-hidden />
              <span className={chips ? "" : "flex-1"}>{chips ? cat.short : cat.title}</span>
              {showCount && (
                <>
                  <span
                    aria-hidden
                    className={`rounded-full px-1.5 text-xs tabular-nums ${chips ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-500"}`}
                  >
                    {n}
                  </span>
                  <span className="sr-only"> ({countLabel(n)})</span>
                </>
              )}
            </>
          );
          const cls = chips
            ? "inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-sm font-medium text-slate-200"
            : "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-slate-700";
          return (
            <li key={cat.id}>
              {n > 0 ? (
                <a
                  href={`#cat-${cat.id}`}
                  className={`${cls} transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                    chips ? "hover:bg-white/10 hover:text-white focus-visible:ring-blue-400" : "hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-blue-500"
                  }`}
                >
                  {inner}
                </a>
              ) : (
                <span className={`${cls} cursor-default opacity-40`}>
                  {inner}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ── One category: its title and its questions ──
export function PreguntasCategoryBlock({
  category, matches, terms, value, onValueChange, countLabel,
}: {
  category: PreguntasCategory;
  matches: PreguntasMatch[];
  terms: string[];
  /** Open questions (ids from every category; this one only uses its own). */
  value: string[];
  onValueChange: (value: string[]) => void;
  countLabel: (n: number) => string;
}) {
  const Icon = preguntasIcons[category.id];
  const titleId = `cat-${category.id}-title`;
  return (
    <section id={`cat-${category.id}`} aria-labelledby={titleId} className="scroll-mt-nav">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={titleId} className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{category.title}</h2>
          <p className="text-sm text-slate-500">{countLabel(matches.length)}</p>
        </div>
      </div>
      <Accordion
        type="multiple"
        value={value}
        onValueChange={onValueChange}
        className="mt-5 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-4 sm:px-6"
      >
        {matches.map(({ item, id }) => (
          <AccordionItem key={id} value={id} className="border-0">
            <AccordionTrigger className="min-h-11 items-center py-5 text-left text-base font-semibold text-slate-900 hover:no-underline focus-visible:ring-blue-500/40 [&>svg]:translate-y-0 [&>svg]:text-slate-400">
              <span>
                <Highlight text={item.q} terms={terms} />
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-3 pb-5 pr-2 text-[15px] leading-relaxed text-slate-600 sm:pr-8">
              {item.a.map((block, i) =>
                typeof block === "string" ? (
                  <p key={i}>
                    <Highlight text={block} terms={terms} />
                  </p>
                ) : (
                  <ul key={i} className="space-y-2">
                    {block.map((li) => (
                      <li key={li} className="flex gap-3">
                        <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                        <span>
                          <Highlight text={li} terms={terms} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ),
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {category.more && (
        <Link
          to={category.more.to}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[15px] font-semibold text-blue-700 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {category.more.label} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </section>
  );
}

// ── Nothing matched ──
export function PreguntasEmpty({ c, query, onPick, onClear }: { c: C["empty"]; query: string; onPick: (word: string) => void; onClear: () => void }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center motion-safe:animate-fade-in">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200">
        <SearchX className="h-7 w-7" aria-hidden />
      </span>
      <h2 className="mx-auto mt-5 max-w-md break-words text-xl font-semibold text-slate-900">{c.title(query.trim())}</h2>
      <p className="mt-2 text-slate-600">{c.text}</p>
      <ul className="mt-5 flex flex-wrap justify-center gap-2">
        {c.suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onPick(s)}
              className="h-11 rounded-full bg-white px-5 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition-colors hover:text-slate-900 hover:ring-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClear}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <X className="h-4 w-4" aria-hidden /> {c.clear}
      </button>
    </div>
  );
}

// ── Didn't find your answer? ──
export function PreguntasHelp({ c, days }: { c: C["help"]; days: number }) {
  return (
    <Reveal>
      <section aria-labelledby="faq-help-title" className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 via-white to-slate-50 p-7 ring-1 ring-slate-200 sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="relative">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <MessageCircleQuestion className="h-6 w-6" aria-hidden />
          </span>
          <h2 id="faq-help-title" className="mt-5 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{c.title}</h2>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-slate-600">{c.text(days)}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/register"
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {c.register}
              <ArrowRight className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              to="/login"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-6 text-[15px] font-semibold text-slate-800 ring-1 ring-slate-300 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {c.login}
            </Link>
          </div>
          <p className="mt-6 flex gap-2.5 text-[15px] leading-relaxed text-slate-600">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden />
            <span>{c.taxes}</span>
          </p>
          <div className="mt-7 border-t border-slate-200 pt-6">
            <p className="text-sm font-semibold text-slate-900">{c.moreLabel}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {c.links.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:text-slate-900 hover:ring-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {l.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </Reveal>
  );
}
