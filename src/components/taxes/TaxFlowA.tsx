import { useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Eye, Loader2, Send, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { taxesCopy } from "@/i18n/copy/taxes";
import { shownDocKinds, type Answers, type TaxDocKind, type TaxMode } from "@contracts/taxRules";
import { TaxDocPhoto } from "./TaxDocArt";
import { TaxExampleDialog, TaxPick, type PickFn } from "./TaxDocs";
import { TaxQuestions } from "./TaxDraft";
import { clientFiles, type Doc } from "./taxView";

type Legal = "terms" | "privacy" | "use";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const btnPrimary = `inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-[0_10px_22px_-12px_rgba(37,99,235,0.9)] transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none ${FOCUS}`;
const btnGhost = `inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 ${FOCUS}`;

/**
 * Option A ("un paso a la vez"), before sending: the three parts as tabs (Tu situación, Tus documentos,
 * Enviar), one at a time. Documents are big tiles with the example photo; optional ones go below as "Si los
 * tienes". Sending asks for three checkboxes (terms, privacy, use of the information), each readable first.
 */
export function TaxFlowA({ mode, year, answers, docs, unanswered, incomeMissing, busyAnswers, onAnswer, onPick, busyKind, onOpen, onRemove,
  preparerName, deadline, daysLeft, sending, onSend, onAsk }: {
  mode: TaxMode; year: number; answers: Answers; docs: readonly Doc[]; unanswered: number; incomeMissing: boolean; busyAnswers: boolean;
  onAnswer: (q: string, v: boolean | null) => void; onPick: PickFn; busyKind: string | null; onOpen: (d: Doc) => void; onRemove: (d: Doc) => void;
  preparerName: string; deadline: string; daysLeft: number; sending: boolean; onSend: () => void; onAsk: () => void;
}) {
  const t = useCopy(taxesCopy);
  const f = t.p.flow;
  const kinds = shownDocKinds(mode, answers);
  const has = (k: TaxDocKind) => { const fl = clientFiles(docs, k.id); return fl.length > 0 && !fl.some((x) => x.status === "redo"); };
  const required = kinds.filter((k) => k.need === "yes");
  const income = kinds.filter((k) => k.need === "income");
  const main = kinds.filter((k) => k.need !== "opt");
  const maybe = kinds.filter((k) => k.need === "opt");
  const total = required.length + (income.length ? 1 : 0);
  const done = required.filter(has).length + (income.length && !incomeMissing ? 1 : 0);
  const situationDone = unanswered === 0;
  const docsDone = done === total;
  const [part, setPart] = useState(() => (!situationDone ? 0 : !docsDone ? 1 : 2));
  const [example, setExample] = useState<string | null>(null);
  const [legal, setLegal] = useState<Legal | null>(null);
  const [agree, setAgree] = useState<Record<Legal, boolean>>({ terms: false, privacy: false, use: false });
  const go = (n: number) => { setPart(n); document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" }); };
  const partDone = [situationDone, docsDone, false];
  const uploaded = kinds.filter((k) => clientFiles(docs, k.id).length > 0);
  const canSend = situationDone && docsDone && agree.terms && agree.privacy && agree.use;

  const tile = (k: TaxDocKind) => {
    const files = clientFiles(docs, k.id);
    const copy = t.docs[mode][k.id] ?? { title: k.id, sub: "" };
    const first = files[0];
    const redo = files.some((x) => x.status === "redo");
    const ok = files.length > 0 && files.every((x) => x.status === "ok");
    const incomeTile = k.need === "income";
    const chip = redo ? ["amber", t.p.docs.status.redo] : ok ? ["ok", t.p.docs.status.ok] : files.length ? ["blue", t.p.docs.status.got]
      : k.need === "yes" ? ["amber", t.need.required] : incomeTile && incomeMissing ? ["amber", t.need.income] : ["gray", f.maybeTitle];
    const tone: Record<string, string> = { amber: "bg-amber-50 text-amber-700", ok: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", gray: "bg-slate-100 text-slate-600" };
    return (
      <li key={k.id} className="tax-tile flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-20px_rgba(15,23,42,0.4)]">
        <button type="button" onClick={() => setExample(k.id)} aria-label={t.p.docs.exampleSee(copy.title)} className={`group relative block aspect-[4/3] w-full overflow-hidden bg-slate-100 ${FOCUS}`}>
          <TaxDocPhoto kind={k.id} title="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          <span className={cn("absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold shadow-sm", tone[chip[0]])}>{chip[1]}</span>
          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"><Eye className="h-3 w-3" aria-hidden="true" />{t.p.docs.exampleLink}</span>
        </button>
        <div className="flex flex-1 flex-col gap-1 px-3.5 pb-3.5 pt-3">
          <b className="text-[14px] leading-snug text-slate-900">{copy.title}</b>
          <span className="text-[12.5px] leading-snug text-slate-500">{first ? (files.length > 1 ? f.uploadedMany(files.length) : f.uploadedOne(first.fileName)) : copy.sub}</span>
          {redo && files.filter((x) => x.status === "redo" && x.note).map((x) => <span key={x.id} className="text-xs font-semibold text-amber-700">{x.note}</span>)}
          {files.length > 0 && (
            <ul className="mt-1 grid gap-1">
              {files.map((x) => (
                <li key={x.id} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700">
                  <span className="min-w-0 flex-1 truncate">{x.fileName}</span>
                  <button type="button" onClick={() => onOpen(x)} className={`rounded-md px-1.5 py-1 font-semibold text-blue-600 hover:bg-white ${FOCUS}`}>{t.p.docs.view}</button>
                  {x.status !== "ok" && <button type="button" onClick={() => onRemove(x)} aria-label={t.p.docs.remove(x.fileName)} className={`rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-700 ${FOCUS}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto pt-2.5">
            {!ok && (
              <TaxPick kind={k.id} title={copy.title} has={files.length > 0} replace={redo ? files.find((x) => x.status === "redo") : undefined} onPick={onPick} busy={busyKind === k.id}
                className={files.length ? "w-full justify-center" : "h-10 w-full justify-center border-blue-600 bg-blue-600 text-white hover:bg-blue-700"} />
            )}
          </div>
        </div>
      </li>
    );
  };

  const legalCopy = legal ? t.p.legal[legal] : null;
  const legalHref = legal === "privacy" ? "/privacy" : "/terminos";
  const box = (key: Legal, [a, link, b]: [string, string, string]) => (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-[14px] border px-3.5 py-3 text-[13.5px] leading-relaxed text-slate-700 transition-colors", agree[key] ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-white hover:border-slate-300")}>
      <input type="checkbox" checked={agree[key]} onChange={(e) => setAgree((g) => ({ ...g, [key]: e.target.checked }))} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" />
      <span>{a}<button type="button" onClick={(e) => { e.preventDefault(); setLegal(key); }} className="font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700">{link}</button>{b}</span>
    </label>
  );

  return (
    <div className="mt-3.5 grid gap-3.5">
      {/* Deadline and your preparer */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 ring-1 ring-slate-200"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{f.deadline(deadline, daysLeft)}</span>
        <button type="button" onClick={onAsk} className={`inline-flex items-center gap-1.5 rounded-full bg-blue-50 py-1 pl-1 pr-3 text-[12.5px] font-semibold text-blue-700 ring-1 ring-blue-100 transition-colors hover:bg-blue-100 ${FOCUS}`}>
          <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{preparerName.charAt(0).toUpperCase()}</span>{f.prepChip(preparerName)}
        </button>
      </div>

      {/* The three parts */}
      <nav className="grid grid-cols-3 gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5" aria-label={f.parts.join(", ")}>
        {f.parts.map((label, i) => {
          const on = part === i;
          const ok = partDone[i];
          return (
            <button key={label} type="button" onClick={() => go(i)} aria-current={on ? "step" : undefined}
              className={cn(`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-center text-[12.5px] font-semibold leading-tight transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:text-left sm:text-[13.5px] ${FOCUS}`,
                on ? "bg-blue-50 text-blue-700" : ok ? "text-emerald-700 hover:bg-slate-50" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600")}>
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors",
                ok && !on ? "bg-emerald-600 text-white" : on ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-400")}>
                {ok && !on ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
              </span>
              <span className="max-w-full sm:truncate">{label}</span>
            </button>
          );
        })}
      </nav>

      <div key={part} className="tax-part grid gap-3.5">
        {part === 0 && (
          <>
            <TaxQuestions id="tax-q" mode={mode} year={year} answers={answers} busy={busyAnswers} onAnswer={onAnswer} />
            <div className="flex justify-end"><button type="button" onClick={() => go(1)} className={btnPrimary}>{f.next(f.parts[1])}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div>
          </>
        )}

        {part === 1 && (
          <>
            <section className="grid gap-3 rounded-[16px] border border-slate-200 bg-white p-4" aria-labelledby="tax-docs-h">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><h2 id="tax-docs-h" className="font-semibold text-slate-900">{t.p.docs.title}</h2><p className="text-[13px] text-slate-500">{f.tipDocs}</p></div>
                <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{f.ready(done, total)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true"><i className="block h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-[width] duration-700" style={{ width: `${total ? (done / total) * 100 : 100}%` }} /></div>
              <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">{main.map(tile)}</ul>
              {maybe.length > 0 && (
                <div className="grid gap-2 border-t border-slate-100 pt-3">
                  <div><p className="text-[13px] font-semibold text-slate-700">{f.maybeTitle}</p><p className="text-xs text-slate-500">{f.maybeText}</p></div>
                  <div className="flex flex-wrap gap-2">
                    {maybe.map((k) => {
                      const n = clientFiles(docs, k.id).length;
                      return (
                        <button key={k.id} type="button" onClick={() => setExample(k.id)}
                          className={`flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 text-[13px] font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/40 ${FOCUS}`}>
                          <span className="h-[30px] w-10 overflow-hidden rounded-md bg-slate-100"><TaxDocPhoto kind={k.id} className="h-full w-full object-cover" /></span>
                          {t.docs[mode][k.id]?.title ?? k.id}
                          {n > 0 && <CheckCircle2 className="h-4 w-4 text-blue-600" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
            <div className="flex flex-wrap justify-between gap-2">
              <button type="button" onClick={() => go(0)} className={btnGhost}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{f.parts[0]}</button>
              <button type="button" onClick={() => go(2)} className={btnPrimary}>{f.next(f.parts[2])}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
            </div>
          </>
        )}

        {part === 2 && (
          <section className="grid gap-3 rounded-[16px] border border-slate-200 bg-white p-4" aria-labelledby="tax-send-h">
            <div><h2 id="tax-send-h" className="font-semibold text-slate-900">{f.sendTitle}</h2><p className="text-[13px] text-slate-500">{f.sendText(uploaded.reduce((n, k) => n + clientFiles(docs, k.id).length, 0), preparerName)}</p></div>
            <ul className="grid gap-2">
              {uploaded.map((k) => (
                <li key={k.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-2.5 py-2">
                  <span className="h-[34px] w-[46px] shrink-0 overflow-hidden rounded-md bg-slate-100"><TaxDocPhoto kind={k.id} className="h-full w-full object-cover" /></span>
                  <span className="min-w-0 flex-1"><b className="block truncate text-[13.5px] text-slate-900">{t.docs[mode][k.id]?.title ?? k.id}</b><span className="block truncate text-xs text-slate-500">{clientFiles(docs, k.id).map((x) => x.fileName).join(", ")}</span></span>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /></span>
                </li>
              ))}
            </ul>
            {!(situationDone && docsDone) && (
              <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">{f.finishFirst}{" "}
                <button type="button" onClick={() => go(situationDone ? 1 : 0)} className="font-semibold underline underline-offset-2">{f.parts[situationDone ? 1 : 0]}</button>
              </p>
            )}
            <p className="mt-1 text-[14px] font-bold text-slate-900">{f.markAll}</p>
            {box("terms", f.terms)}
            {box("privacy", f.privacy)}
            {box("use", f.use)}
            <button type="button" onClick={onSend} disabled={!canSend || sending} className={cn(btnPrimary, "h-12 w-full text-[15px]")}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}{f.send(preparerName)}
            </button>
            <p className="text-center text-xs text-slate-500">{f.cancelNote}</p>
          </section>
        )}
      </div>

      <TaxExampleDialog mode={mode} kind={example} docs={docs} busyKind={busyKind} onPick={onPick} onClose={() => setExample(null)} />

      {/* Terms, privacy, what you authorize: a short summary here, the whole text one tap away. */}
      <Dialog open={!!legal} onOpenChange={(o) => { if (!o) setLegal(null); }}>
        <DialogContent className="top-auto bottom-0 h-auto max-h-[92dvh] gap-0 overflow-y-auto rounded-t-[24px] p-0 sm:bottom-auto sm:max-w-[480px] sm:rounded-[20px]">
          {legalCopy && (
            <div className="grid gap-3 p-5 sm:p-6">
              <DialogTitle className="pr-8 text-lg font-bold text-slate-900">{legalCopy.title}</DialogTitle>
              <DialogDescription className="text-sm text-slate-500">{legalCopy.intro}</DialogDescription>
              <ul className="grid gap-2">
                {legalCopy.items.map(([h, x]) => (
                  <li key={h} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-[13.5px] text-slate-600">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check className="h-3 w-3" strokeWidth={3.2} aria-hidden="true" /></span>
                    <span><b className="block text-slate-900">{h}</b>{x}</span>
                  </li>
                ))}
              </ul>
              {legal !== "use" && <a href={legalHref} target="_blank" rel="noopener noreferrer" className="w-fit text-sm font-semibold text-blue-600 underline underline-offset-2 hover:text-blue-700">{t.p.legal.read}</a>}
              <button type="button" onClick={() => setLegal(null)} className={cn(btnPrimary, "w-full")}>{t.p.legal.ok}</button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
