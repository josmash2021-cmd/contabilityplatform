import { useId, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { clientesCopy } from "@/i18n/copy/clientes";
import { IMPORT_FIELDS, guessField, splitFullName, type ImportField } from "../../../api/lib/ventas";
import { PosSheet } from "@/components/pos/PosSheet";
import { Note } from "@/components/pos/proto";
import { FOCUS, LINK_BTN, MENU_TITLE, btn } from "@/components/pos/ui";
import { FileLogo } from "@/components/FileLogo";

type Sheet = { fileName: string; headers: string[]; data: string[][] };
type Row = { name: string; lastName?: string; email?: string; phone?: string; address?: string; notes?: string };

const MAX_ROWS = 5000;

/** Spreadsheet rows → client rows, following the column mapping. Rows without a name are left out. */
function buildRows(sheet: Sheet, map: ImportField[]): Row[] {
  const out: Row[] = [];
  for (const cells of sheet.data) {
    const r: Row = { name: "" };
    const notes: string[] = [];
    map.forEach((field, i) => {
      const v = String(cells[i] ?? "").trim();
      if (!v || field === "skip") return;
      if (field === "fullName") { const s = splitFullName(v); r.name = r.name || s.name; r.lastName = r.lastName || s.lastName || undefined; }
      else if (field === "notes") notes.push(v);
      else if (field === "name") r.name = r.name ? `${r.name} ${v}` : v;
      else if (!r[field]) r[field] = v;
    });
    if (notes.length) r.notes = notes.join(" · ");
    if (r.name) out.push(r);
  }
  return out.slice(0, MAX_ROWS);
}

/**
 * The prototype's "Importar clientes" (`.imp-file`, `.imp-map`): read an Excel/CSV in the browser,
 * say what each column is, see who you already have (they're merged, not repeated), import.
 * Owner only (customers.importMerge isn't in the staff list).
 */
export function ImportCustomersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useCopy(clientesCopy);
  const d = t.importDialog;
  const id = useId();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [map, setMap] = useState<ImportField[]>([]);

  const check = trpc.customers.importMerge.useMutation();
  const run = trpc.customers.importMerge.useMutation({
    onSuccess: (res) => {
      void utils.customers.list.invalidate();
      void utils.customers.stats.invalidate();
      void utils.customers.overview.invalidate();
      toast.success(t.toast.imported(res.created, res.merged, res.errors));
      close(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) { setSheet(null); setMap([]); check.reset(); }
  };

  const recheck = (s: Sheet, m: ImportField[]) => {
    const rows = buildRows(s, m);
    if (rows.length > 0) check.mutate({ dryRun: true, rows });
    else check.reset();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be chosen again
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Array<string | number>>(ws, { header: 1, blankrows: false });
      if (raw.length < 2) { toast.error(t.toast.emptyFile); return; }
      const headers = (raw[0] as Array<string | number>).map((h, i) => String(h ?? "").trim() || `#${i + 1}`);
      const data = raw.slice(1).map((r) => headers.map((_, i) => String((r as Array<string | number>)[i] ?? "").trim())).filter((r) => r.some(Boolean));
      if (data.length === 0) { toast.error(t.toast.emptyFile); return; }
      // Each field once: the first column that looks like it wins, the rest start as "No importar".
      const used = new Set<ImportField>();
      const guessed = headers.map((h) => {
        const g = guessField(h);
        if (g === "skip" || (g !== "notes" && used.has(g))) return "skip" as const;
        used.add(g);
        return g;
      });
      const s = { fileName: file.name, headers, data };
      setSheet(s);
      setMap(guessed);
      recheck(s, guessed);
    } catch {
      toast.error(t.toast.readError);
    }
  };

  const setField = (i: number, f: ImportField) => {
    if (!sheet) return;
    const next = map.map((x, k) => (k === i ? f : x));
    setMap(next);
    recheck(sheet, next);
  };

  const hasName = map.includes("name") || map.includes("fullName");
  const res = check.data;
  const doImport = () => {
    if (!sheet) return;
    if (!hasName) { toast.error(t.toast.noName); return; }
    const rows = buildRows(sheet, map);
    if (rows.length === 0) { toast.error(t.toast.emptyFile); return; }
    run.mutate({ dryRun: false, rows });
  };
  const label = !res ? d.importN(sheet ? buildRows(sheet, map).length : 0) : res.newCount === 0 && res.mergeCount > 0 ? d.importMerged(res.mergeCount) : d.importN(res.newCount);

  return (
    <PosSheet open={open} onOpenChange={close} title={d.title} closeLabel={t.form.close} wide>
      <input id={`${id}-file`} ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="sr-only" tabIndex={-1} aria-label={d.choose} />
      {!sheet ? (
        <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-100 px-4 py-6 text-center">
          <Upload className="h-6 w-6 text-blue-600" aria-hidden />
          <button type="button" onClick={() => fileRef.current?.click()} className={btn("primary")}><FileLogo kind="excel" className="h-4 w-4" />{d.choose}</button>
          <p className="text-xs text-slate-500">{d.chooseHint}</p>
        </div>
      ) : (
        <>
          {/* `.imp-file` */}
          <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-100 p-3">
            <Upload className="h-5 w-5 flex-none text-blue-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm text-slate-900">{sheet.fileName}</b>
              <span className="block text-xs text-slate-500">{d.rows(sheet.data.length)}</span>
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className={cn(LINK_BTN, "text-[13px]")}>{d.chooseOther}</button>
          </div>

          {/* `.imp-map` */}
          <p className={MENU_TITLE}>{d.mapTitle}</p>
          <div className="grid gap-1.5">
            {sheet.headers.map((h, i) => (
              <div key={`${h}-${i}`} className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-2 text-sm">
                <span className="truncate text-slate-900" title={h}>{h}</span>
                <span className="text-slate-500" aria-hidden>→</span>
                <select
                  value={map[i] ?? "skip"} onChange={(e) => setField(i, e.target.value as ImportField)} aria-label={d.mapLabel(h)}
                  className={`min-h-11 rounded-[9px] border border-slate-200 bg-white px-2 text-sm text-slate-900 sm:min-h-9 ${FOCUS}`}
                >
                  {IMPORT_FIELDS.map((f) => <option key={f} value={f}>{d.fields[f]}</option>)}
                </select>
              </div>
            ))}
          </div>

          {!hasName && <p className="mt-3 text-[13px] font-semibold text-amber-700">{d.noNameCol}</p>}
          {check.isPending && <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{d.checking}</p>}
          {res && !check.isPending && res.mergeCount > 0 && <Note className="mt-3">{d.dupes(res.mergeCount, res.mergeNames)}</Note>}
          {res && !check.isPending && res.repeatedInFile > 0 && <p className="mt-2 text-[13px] text-slate-500">{d.repeated(res.repeatedInFile)}</p>}

          <div className="mt-3.5 flex flex-wrap gap-1.5">
            <button
              type="button" onClick={doImport}
              disabled={run.isPending || !hasName || (!!res && res.newCount === 0 && res.mergeCount === 0)}
              className={btn("primary")}
            >
              {run.isPending ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{d.importing}</> : label}
            </button>
          </div>
        </>
      )}
    </PosSheet>
  );
}
