import { useState } from "react";
import { Camera, Check, CheckCircle2, FileText, Image as ImageIcon, Loader2, Lock, Plus, RefreshCw, Search, Trash2, Upload, User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TaxDocArt } from "./TaxDocArt";
import { TaxStepNum } from "./TaxStepNum";
import { Dst, pbtnSm, type Tone } from "@/components/personal/planKit";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { taxesCopy } from "@/i18n/copy/taxes";
import { shownDocKinds, type Answers, type TaxDocKind, type TaxMode } from "@contracts/taxRules";
import { GROUP_ORDER, MAX_FILES, clientFiles, docState, fileSize, groupOf, isMulti, type Doc, type DocState } from "./taxView";
import { FileLogo } from "@/components/FileLogo";

export type PickSource = "camera" | "gallery" | "pdf";
export type PickFn = (kind: string, source: PickSource, replace?: Doc) => void;

const STATE_TONE: Record<DocState, Tone> = { missing: "warn", jan31: "open", whenYes: "open", optional: "muted", redo: "bad", ok: "good", got: "open" };

/** "Subir / Cambiar / Agregar otro" with its menu: take a photo, from the gallery, or a PDF (the prototype's taxPickMenu). */
export function TaxPick({ kind, title, has, replace, onPick, busy }: { kind: string; title: string; has: boolean; replace?: Doc; onPick: PickFn; busy: boolean }) {
  const d = useCopy(taxesCopy).p.docs;
  const add = has && !replace;
  const label = replace ? d.change : add ? d.addAnother : d.upload;
  const Icon = replace ? RefreshCw : add ? Plus : Upload;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={busy} aria-label={d.pickAria(label, title)} className={pbtnSm}>
          {busy ? <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden="true" /> : <Icon className="h-[15px] w-[15px]" aria-hidden="true" />}{busy ? d.uploading : label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-[14px] p-1.5">
        <DropdownMenuItem onSelect={() => onPick(kind, "camera", replace)} className="min-h-10 gap-2.5 rounded-[10px]"><Camera className="h-4 w-4 text-slate-500" aria-hidden="true" />{d.camera}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPick(kind, "gallery", replace)} className="min-h-10 gap-2.5 rounded-[10px]"><Upload className="h-4 w-4 text-slate-500" aria-hidden="true" />{d.gallery}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onPick(kind, "pdf", replace)} className="min-h-10 gap-2.5 rounded-[10px]"><FileLogo kind="pdf" className="h-4 w-4" />{d.pdf}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A file's square: PDF sheet, photo, or an empty dashed slot. No previews of the content (files stay encrypted until opened). */
export function TaxThumb({ file, kind, mini, count }: { file?: Doc; kind: string; mini?: boolean; count?: number }) {
  const size = mini ? "h-9 w-9 rounded-lg" : "h-[52px] w-[52px] rounded-[10px]";
  if (!file) {
    const Empty = kind === "id" || kind === "spouse" ? User : FileText;
    return <span className={cn("relative grid shrink-0 place-items-center border border-dashed border-slate-200 text-slate-400", size)} aria-hidden="true"><Empty className={mini ? "h-4 w-4" : "h-[18px] w-[18px]"} /></span>;
  }
  const pdf = file.mimeType === "application/pdf";
  return (
    <span className={cn("relative grid shrink-0 place-items-center", pdf ? "bg-gradient-to-b from-slate-50 to-slate-100" : "bg-slate-200 text-slate-600", size)} aria-hidden="true">
      {pdf ? (
        <FileLogo kind="pdf" className={mini ? "h-7 w-7" : "h-9 w-9"} />
      ) : <ImageIcon className={mini ? "h-4 w-4" : "h-5 w-5"} />}
      {count && count > 1 ? <i className="absolute bottom-[3px] right-[3px] min-w-[18px] rounded-full bg-slate-900 px-1.5 text-center text-[10px] font-bold not-italic leading-[18px] text-white">{count}</i> : null}
    </span>
  );
}

function fileInfo(f: Doc) {
  return `${f.fileName} · ${fileSize(f.size)}`;
}

/**
 * "Tus documentos" (taxDocsCard): the documents asked for, by group (Identidad, Ingresos…), each with its
 * status and what you can do (see, upload, change, add another, remove). A group with everything reviewed
 * folds into one green line.
 */
export function TaxDocsCard({ mode, answers, docs, onPick, busyKind, onOpen, onRemove, id, n }: {
  mode: TaxMode; answers: Answers; docs: readonly Doc[]; onPick: PickFn; busyKind: string | null; onOpen: (d: Doc) => void; onRemove: (d: Doc) => void; id?: string;
  /** Before sending: this part's number (2), with a check once every required document is in. */
  n?: number;
}) {
  const t = useCopy(taxesCopy);
  const d = t.p.docs;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [example, setExample] = useState<string | null>(null);
  const kinds = shownDocKinds(mode, answers);
  const titleOf = (k: string) => t.docs[mode][k]?.title ?? k;
  const have = kinds.filter((k) => clientFiles(docs, k.id).length > 0).length;

  const row = (k: TaxDocKind) => {
    const files = clientFiles(docs, k.id);
    const state = docState(k, files);
    const copy = t.docs[mode][k.id] ?? { title: k.id, sub: "" };
    const multi = isMulti(k.id);
    const many = multi && files.length > 1 ? d.status.many(files.length) : "";
    const busy = busyKind === k.id;
    const first = files[0];
    const head = (
      <>
        <b className="text-sm text-slate-900">{copy.title}{k.need === "yes" && <span className="ml-1 text-[11px] font-semibold text-slate-500">{d.required}</span>}</b>
        <span className="text-[13px] text-slate-500">{copy.sub}</span>
        <button type="button" onClick={() => setExample(k.id)} className="inline-flex w-fit items-center gap-1 rounded text-xs font-semibold text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <Search className="h-3 w-3" aria-hidden="true" />{d.exampleLink}
        </button>
      </>
    );
    // No file yet: the example picture (it opens big); with a file: the file's square.
    const thumb = (file?: Doc, count?: number) => file ? <TaxThumb file={file} kind={k.id} count={count} /> : (
      <button type="button" onClick={() => setExample(k.id)} aria-label={d.exampleSee(copy.title)}
        className="group relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[10px] bg-slate-50 ring-1 ring-slate-200 transition hover:ring-2 hover:ring-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <TaxDocArt kind={k.id} className="h-full w-full scale-[1.18] transition-transform duration-300 group-hover:scale-[1.28]" />
        <span className="absolute inset-x-0 bottom-0 bg-white/90 py-px text-center text-[8px] font-bold uppercase tracking-wide text-slate-500">{d.exampleTag}</span>
      </button>
    );
    const status = <Dst tone={STATE_TONE[state]} className="text-[12px]">{["ok", "got"].includes(state) ? many : ""}{d.status[state]}</Dst>;
    const del = (f: Doc) => f.status !== "ok" && (
      <button type="button" onClick={() => onRemove(f)} aria-label={d.remove(f.fileName)} title={d.remove(f.fileName)} className={cn(pbtnSm, "w-10 px-0 sm:w-9")}>
        <Trash2 className="h-[15px] w-[15px]" aria-hidden="true" />
      </button>
    );
    if (!multi) {
      return (
        <li key={k.id} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 sm:grid-cols-[52px_minmax(0,1fr)_auto]">
          {thumb(first)}
          <div className="grid min-w-0 gap-[3px]">{head}{first && <span className="truncate text-xs text-slate-900">{fileInfo(first)}</span>}{status}</div>
          <div className="col-span-2 flex flex-wrap justify-end gap-1.5 sm:col-span-1">
            {first && <button type="button" onClick={() => onOpen(first)} className={pbtnSm}>{d.view}</button>}
            {(!first || first.status !== "ok") && <TaxPick kind={k.id} title={copy.title} has={!!first} replace={first} onPick={onPick} busy={busy} />}
            {first && del(first)}
          </div>
        </li>
      );
    }
    return (
      <li key={k.id} className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 sm:grid-cols-[52px_minmax(0,1fr)_auto]">
        {thumb(first, files.length)}
        <div className="grid min-w-0 gap-[3px]">{head}{status}{files.length >= MAX_FILES && <span className="text-[13px] text-slate-500">{d.max(MAX_FILES)}</span>}</div>
        <div className="col-span-2 flex flex-wrap justify-end gap-1.5 sm:col-span-1">
          {files.length < MAX_FILES && <TaxPick kind={k.id} title={copy.title} has={files.length > 0} onPick={onPick} busy={busy} />}
        </div>
        {files.length > 0 && (
          <ul className="col-span-full mt-0.5 grid gap-1.5">
            {files.map((f) => (
              <li key={f.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] bg-slate-100 px-2 py-1.5">
                <TaxThumb file={f} kind={k.id} mini />
                <span className="min-w-0">
                  <span className="block truncate text-xs text-slate-900">{fileInfo(f)}</span>
                  {f.status === "redo" && f.note && <span className="block text-xs font-semibold text-red-600">{f.note}</span>}
                </span>
                <span className="flex gap-1.5">
                  <button type="button" onClick={() => onOpen(f)} className={pbtnSm}>{d.view}</button>
                  {del(f)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!multi && first?.status === "redo" && first.note && <p className="col-span-full text-xs font-semibold text-red-600">{first.note}</p>}
      </li>
    );
  };

  const groups = GROUP_ORDER.map((g) => ({ g, list: kinds.filter((k) => groupOf(mode, k.id, t.docGroup) === g) })).filter((x) => x.list.length);
  const requiredIn = kinds.filter((k) => k.need === "yes").every((k) => { const f = clientFiles(docs, k.id); return f.length > 0 && !f.some((x) => x.status === "redo"); });
  const ex = example ? { kind: example, copy: t.docs[mode][example] ?? { title: example, sub: "" }, files: clientFiles(docs, example) } : null;
  return (
    <section id={id} className="scroll-mt-4 rounded-[14px] border border-slate-200 bg-white p-4" aria-labelledby="tax-docs-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tax-docs-h" className="flex items-center gap-2.5 font-semibold text-slate-900">{n ? <TaxStepNum n={n} done={requiredIn} /> : null}{d.title}</h2>
        <span className="text-xs text-slate-500 tabular-nums">{d.count(have, kinds.length)}</span>
      </div>
      <p className="mt-0.5 text-sm text-slate-500">{d.tip}</p>
      {groups.map(({ g, list }) => {
        const done = list.every((k) => { const f = clientFiles(docs, k.id); return f.length > 0 && f.every((x) => x.status === "ok"); });
        const expanded = !!open[g];
        return (
          <div key={g}>
            <p className="mb-2 mt-4 flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.04em] text-slate-500">
              {t.groups[g]}
              {done && expanded && <button type="button" onClick={() => setOpen((o) => ({ ...o, [g]: false }))} aria-expanded="true" className="text-xs font-semibold normal-case tracking-normal text-blue-600 hover:underline">{d.hide}</button>}
            </p>
            {done && !expanded ? (
              <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 px-3 py-2.5 text-[13px] text-slate-800">
                <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-emerald-600" aria-hidden="true" />
                <span className="min-w-0 flex-1"><b>{d.doneGroup}</b> {list.map((k) => titleOf(k.id)).join(", ")}. {d.reviewed}</span>
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [g]: true }))} aria-expanded="false" className="min-h-10 shrink-0 text-[13px] font-semibold text-blue-600 hover:underline sm:min-h-0">{d.show}</button>
              </div>
            ) : (
              <ul className="grid gap-2">{list.map(row)}</ul>
            )}
          </div>
        );
      })}
      <p className="mt-3.5 flex items-start gap-2 text-xs text-slate-500"><Lock className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{t.privacy}</span></p>

      {/* "Así se ve": the document big, what it is, tips for the photo, and upload right from here. */}
      <Dialog open={!!ex} onOpenChange={(o) => { if (!o) setExample(null); }}>
        <DialogContent className="top-auto bottom-0 h-auto max-h-[92dvh] gap-0 overflow-y-auto rounded-t-[24px] p-0 sm:bottom-auto sm:max-w-[440px] sm:rounded-[20px]">
          {ex && (
            <>
              <div className="relative bg-gradient-to-b from-slate-50 to-slate-100 px-6 pb-4 pt-6">
                <span className="absolute left-4 top-4 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 shadow-sm ring-1 ring-slate-200">{d.exampleTag}</span>
                <TaxDocArt kind={ex.kind} title={ex.copy.title} className="tax-ex-art mx-auto mt-4 w-full max-w-[340px] drop-shadow-[0_14px_22px_rgba(15,23,42,0.16)]" />
              </div>
              <div className="grid gap-3 px-6 pb-6 pt-4">
                <div className="grid gap-1 pr-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{d.exampleTitle}</p>
                  <DialogTitle className="text-lg font-bold leading-tight text-slate-900">{ex.copy.title}</DialogTitle>
                  <DialogDescription className="text-sm text-slate-500">{ex.copy.sub}</DialogDescription>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[13px] font-semibold text-slate-900">{d.exampleTips}</p>
                  <ul className="mt-1.5 grid gap-1">
                    {d.exampleTipList.map((tip) => <li key={tip} className="flex items-start gap-2 text-[13px] text-slate-600"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />{tip}</li>)}
                  </ul>
                </div>
                <p className="text-xs text-slate-400">{d.exampleSample}</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={() => setExample(null)} className="h-10 rounded-[10px] px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{d.exampleClose}</button>
                  {!(ex.files.length && ex.files.every((f) => f.status === "ok")) && (
                    <TaxPick kind={ex.kind} title={ex.copy.title} has={ex.files.length > 0} replace={isMulti(ex.kind) ? undefined : ex.files[0]} onPick={(kind, source, replace) => { setExample(null); onPick(kind, source, replace); }} busy={busyKind === ex.kind} />
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** After filing (taxDocsDone): every file used in the return, to see; plus what the preparer sent. */
export function TaxDocsDone({ mode, docs, onOpen, preparerOnly }: { mode: TaxMode; docs: readonly Doc[]; onOpen: (d: Doc) => void; preparerOnly?: boolean }) {
  const t = useCopy(taxesCopy);
  const d = t.p.docs;
  const mine = docs.filter((x) => x.source === "client");
  const prep = docs.filter((x) => x.source === "preparer");
  const item = (f: Doc, title: string) => (
    <li key={f.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] bg-slate-100 px-2 py-1.5">
      <TaxThumb file={f} kind={f.kind} mini />
      <span className="min-w-0 truncate text-xs text-slate-900"><b>{title}</b> · {fileInfo(f)}</span>
      <button type="button" onClick={() => onOpen(f)} className={pbtnSm}>{d.view}</button>
    </li>
  );
  return (
    <section className="rounded-[14px] border border-slate-200 bg-white p-4" aria-labelledby="tax-docsdone-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tax-docsdone-h" className="font-semibold text-slate-900">{preparerOnly ? d.fromPreparer : d.doneTitle}</h2>
        <span className="text-xs text-slate-500">{d.files(mine.length + prep.length)}</span>
      </div>
      {!preparerOnly && <p className="mt-0.5 text-sm text-slate-500">{d.doneText}</p>}
      {prep.length > 0 && !preparerOnly && (
        <>
          <p className="mb-2 mt-3 text-xs font-bold uppercase tracking-[0.04em] text-slate-500">{d.fromPreparer}</p>
          <ul className="grid gap-1.5">{prep.map((f) => item(f, t.preparerDocs[f.kind] ?? f.fileName))}</ul>
        </>
      )}
      {preparerOnly && <ul className="mt-2.5 grid gap-1.5">{prep.map((f) => item(f, t.preparerDocs[f.kind] ?? f.fileName))}</ul>}
      {mine.length > 0 && <ul className="mt-3 grid gap-1.5">{mine.map((f) => item(f, t.docs[mode][f.kind]?.title ?? f.kind))}</ul>}
    </section>
  );
}
