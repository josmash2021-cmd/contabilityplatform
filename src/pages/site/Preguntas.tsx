// /preguntas: the help center. Search as you type, jump to a category, open any answer.
// Answers live in src/i18n/copy/site/preguntas.ts; their numbers come from PREGUNTAS_FACTS.
import { useMemo, useRef, useState } from "react";
import { PageHero, SitePage } from "@/components/marketing/SitePage";
import { PREGUNTAS_FACTS } from "@/components/marketing/site/PreguntasFacts";
import { AUTO_OPEN_MAX, filterCategories, searchTerms } from "@/components/marketing/site/PreguntasSearch";
import {
  PreguntasCategoryBlock, PreguntasCategoryLinks, PreguntasEmpty, PreguntasHelp, PreguntasSearchBox,
} from "@/components/marketing/site/PreguntasParts";
import { useCopy } from "@/i18n/useI18n";
import { preguntasCopy, type PreguntasCategoryId } from "@/i18n/copy/site/preguntas";

export default function Preguntas() {
  const c = useCopy(preguntasCopy);
  const categories = useMemo(() => c.categories(PREGUNTAS_FACTS), [c]);

  const [query, setQuery] = useState("");
  // Answers opened by hand, and the ones opened for the current search (kept apart so clearing the search restores the first).
  const [open, setOpen] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;
  const results = useMemo(() => filterCategories(categories, terms), [categories, terms]);
  const found = results.reduce((n, r) => n + r.matches.length, 0);
  const counts: Partial<Record<PreguntasCategoryId, number>> = {};
  for (const r of results) counts[r.category.id] = r.matches.length;

  const changeQuery = (value: string) => {
    setQuery(value);
    const t = searchTerms(value);
    const ids = t.length ? filterCategories(categories, t).flatMap((r) => r.matches.map((m) => m.id)) : [];
    // A few matches: open them, so words found in an answer are visible right away.
    setSearchOpen(ids.length <= AUTO_OPEN_MAX ? ids : []);
  };
  const clearQuery = () => {
    changeQuery("");
    inputRef.current?.focus();
  };
  const pickSuggestion = (word: string) => {
    changeQuery(word);
    resultsRef.current?.focus({ preventScroll: true });
  };
  const goToResults = () => {
    const el = resultsRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "start" });
  };

  return (
    <SitePage title={c.pageTitle}>
      <PageHero eyebrow={c.hero.eyebrow} title={c.hero.title} text={c.hero.text} secondary={{ label: c.hero.secondary, to: "/precios" }}>
        <PreguntasSearchBox
          c={c.search}
          query={query}
          found={found}
          searching={searching}
          inputRef={inputRef}
          onQuery={changeQuery}
          onClear={clearQuery}
          onSubmit={goToResults}
        />
        <PreguntasCategoryLinks
          variant="chips"
          categories={categories}
          counts={counts}
          searching={searching}
          label={c.jumpLabel}
          countLabel={c.count}
        />
      </PageHero>

      <section aria-label={c.resultsLabel} className="bg-white py-16 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-14 lg:px-8">
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <PreguntasCategoryLinks
                variant="list"
                categories={categories}
                counts={counts}
                searching={searching}
                label={c.sideLabel}
                countLabel={c.count}
              />
            </div>
          </div>

          <div ref={resultsRef} tabIndex={-1} className="min-w-0 scroll-mt-24 space-y-14 outline-none">
            {results.length === 0 ? (
              <PreguntasEmpty c={c.empty} query={query} onPick={pickSuggestion} onClear={clearQuery} />
            ) : (
              results.map((r) => (
                <PreguntasCategoryBlock
                  key={r.category.id}
                  category={r.category}
                  matches={r.matches}
                  terms={terms}
                  value={searching ? searchOpen : open}
                  onValueChange={searching ? setSearchOpen : setOpen}
                  countLabel={c.count}
                />
              ))
            )}
            <PreguntasHelp c={c.help} days={PREGUNTAS_FACTS.days} />
          </div>
        </div>
      </section>
    </SitePage>
  );
}
