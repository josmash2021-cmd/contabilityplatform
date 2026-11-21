import { useState } from "react";
import { ChevronDown, BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { reportesCopy } from "@/i18n/copy/reportes";
import { CARD, money, num, type JournalEntry } from "./format";

/** Libro diario (advanced): the latest journal entries, each one opens to show its debit and credit lines. */
export function JournalList({ entries, loading, error, locale }: { entries: JournalEntry[]; loading: boolean; error: boolean; locale: string }) {
  const all = useCopy(reportesCopy);
  const t = all.journal;
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className={CARD} aria-labelledby="rep-journal-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="rep-journal-title" className="font-semibold text-slate-900">{t.title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">{t.tag}</span>
      </div>
      <p className="mt-0.5 text-sm text-slate-500">{t.sub}</p>

      {loading ? (
        <div className="mt-4 space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full bg-slate-100" />)}</div>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{all.error.title}</p>
      ) : entries.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm text-slate-500">{t.empty}</p>
        </div>
      ) : (
        <>
          <p className="mt-3 text-xs text-slate-500">{t.latest(entries.length)} · {t.balanced}</p>
          <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
            {entries.map((e) => {
              const isOpen = open === e.id;
              const date = e.date ? new Date(e.date) : null;
              const panelId = `rep-je-${e.id}`;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpen(isOpen ? null : e.id)}
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-lg py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{e.description}</span>
                      <span className="block truncate text-xs tabular-nums text-slate-500">
                        {/* journalEntries.date is a calendar date: read it in UTC so it doesn't move a day */}
                        {date ? date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : ""} · {e.entryNumber}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{money(num(e.debitTotal))}</span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
                    <span className="sr-only">{isOpen ? t.hideLines : t.showLines}</span>
                  </button>
                  {isOpen && (
                    <div id={panelId} className="mb-3 rounded-xl bg-slate-50 p-3">
                      {e.lines.length === 0 ? (
                        <p className="text-sm text-slate-500">{t.noLines}</p>
                      ) : (
                        <>
                          <div className="hidden grid-cols-[1fr_7rem_7rem] gap-3 border-b border-slate-200 pb-1.5 text-xs font-medium text-slate-500 sm:grid">
                            <span>{t.account}</span><span className="text-right">{t.debit}</span><span className="text-right">{t.credit}</span>
                          </div>
                          <ul className="divide-y divide-slate-200/70">
                            {e.lines.map((l, i) => (
                              <li key={l.id ?? i} className="grid grid-cols-2 gap-x-3 gap-y-0.5 py-2 sm:grid-cols-[1fr_7rem_7rem]">
                                <span className="col-span-2 min-w-0 sm:col-span-1">
                                  <span className="block truncate text-sm text-slate-800">{l.accountName ?? "—"}</span>
                                  <span className="block truncate text-xs text-slate-500">{[l.accountCode, l.description].filter(Boolean).join(" · ")}</span>
                                </span>
                                <span className="text-sm tabular-nums text-slate-900 sm:text-right">
                                  <span className="mr-1 text-xs text-slate-500 sm:hidden">{t.debit}</span>
                                  {num(l.debit) ? money(num(l.debit)) : "—"}
                                </span>
                                <span className="text-right text-sm tabular-nums text-slate-900">
                                  <span className="mr-1 text-xs text-slate-500 sm:hidden">{t.credit}</span>
                                  {num(l.credit) ? money(num(l.credit)) : "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <div className="grid grid-cols-2 gap-x-3 border-t border-slate-200 pt-2 text-sm font-semibold tabular-nums text-slate-900 sm:grid-cols-[1fr_7rem_7rem]">
                            <span className="hidden sm:block">{t.total}</span>
                            <span className="sm:text-right"><span className="mr-1 text-xs font-medium text-slate-500 sm:hidden">{t.debit}</span>{money(num(e.debitTotal))}</span>
                            <span className="text-right"><span className="mr-1 text-xs font-medium text-slate-500 sm:hidden">{t.credit}</span>{money(num(e.creditTotal))}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
