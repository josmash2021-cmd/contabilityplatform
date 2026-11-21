import { useState } from "react";
import { Camera, CheckCircle2, FileText, Image as ImageIcon, Loader2, Lock, Plus, RefreshCw, Trash2, Upload, User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dst, pbtnSm, type Tone } from "@/components/personal/planKit";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { taxesCopy } from "@/i18n/copy/taxes";
import { shownDocKinds, type Answers, type TaxDocKind, type TaxMode } from "@contracts/taxRules";
import { GROUP_ORDER, MAX_FILES, clientFiles, docState, fileSize, groupOf, isMulti, type Doc, type DocState } from "./taxView";

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
        <DropdownMenuItem onSelect={() => onPick(kind, "pdf", replace)} className="min-h-10 gap-2.5 rounded-[10px]"><FileText className="h-4 w-4 text-slate-500" aria-hidden="true" />{d.pdf}</DropdownMenuItem>
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
        <span className={cn("relative grid place-items-end rounded-[3px] border border-slate-300 bg-white", mini ? "h-[27px] w-[22px]" : "h-9 w-[30px]")}>
          <span className={cn("absolute -left-1 rounded-[3px] bg-red-600 px-0.5 font-extrabold leading-none text-white", mini ? "bottom-1 text-[6px]" : "bottom-1.5 text-[7.5px]")}>PDF</span>
        </span>
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
export function TaxDocsCard({ mode, answers, docs, onPick, busyKind, onOpen, onRemove, id }: {
  mode: TaxMode; answers: Answers; docs: readonly Doc[]; onPick: PickFn; busyKind: string | null; onOpen: (d: Doc) => void; onRemove: (d: Doc) => void; id?: string;
}) {
  const t = useCopy(taxesCopy);
  const d = t.p.docs;
  const [open, setOpen] = useState<Record<string, boolean>>({});
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
      </>
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
          <TaxThumb file={first} kind={k.id} />
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
        <TaxThumb file={first} kind={k.id} count={files.length} />
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
  return (
    <section id={id} className="rounded-[14px] border border-slate-200 bg-white p-4" aria-labelledby="tax-docs-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="tax-docs-h" className="font-semibold text-slate-900">{d.title}</h2>
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
