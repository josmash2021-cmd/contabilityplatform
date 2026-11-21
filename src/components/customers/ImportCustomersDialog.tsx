import { useId, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { clientesCopy } from "@/i18n/copy/clientes";
import type { ImportRow } from "./customerUtils";

const PREVIEW = 50;

/** Reads an Excel/CSV file in the browser and sends its rows to customers.importExcel (same columns as before the redesign). */
export function ImportCustomersDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useCopy(clientesCopy);
  const d = t.importDialog;
  const id = useId();
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) { setRows([]); setFileName(""); }
  };

  const importExcel = trpc.customers.importExcel.useMutation({
    onSuccess: (res) => {
      void utils.customers.list.invalidate();
      void utils.customers.stats.invalidate();
      toast.success(t.toast.imported(res.created, res.errors));
      close(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be chosen again
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Array<string | number>>(ws, { header: 1 });
      if (data.length < 2) { toast.error(t.toast.emptyFile); return; }
      const headers = (data[0] as Array<string | number>).map((h) => String(h).toLowerCase().trim());
      const parsed = data.slice(1).map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = String(row[i] ?? "").trim(); });
        return obj;
      }).filter((r) => r[headers[0]]);
      const mapped: ImportRow[] = parsed.map((row) => {
        const get = (...keys: string[]) => { for (const k of keys) { if (row[k] !== undefined && row[k] !== "") return row[k]; } return ""; };
        return {
          name: get("nombre", "name", "nombres"), lastName: get("apellido", "lastname", "apellidos"),
          email: get("email", "correo", "e-mail"), phone: get("telefono", "phone", "telf", "celular"),
          address: get("direccion", "address", "dir"), notes: get("notas", "notes"),
        };
      }).filter((m) => m.name);
      setRows(mapped);
      setFileName(file.name);
    } catch {
      toast.error(t.toast.readError);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} className="grid-cols-1 content-start gap-0 overflow-y-auto bg-white p-0 sm:max-h-[calc(100dvh-4rem)] sm:max-w-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-bold tracking-tight text-slate-900">{d.title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-slate-500">{d.text}</DialogDescription>
          </div>
          <button type="button" onClick={() => close(false)} aria-label={t.form.close}
            className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-4 px-4 py-5 sm:px-6">
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-5 text-center">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-emerald-600" />
            <p className="mt-2 text-sm text-slate-600">{d.columns}</p>
            <label htmlFor={`${id}-file`} className="sr-only">{d.fileLabel}</label>
            <input id={`${id}-file`} ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="sr-only" tabIndex={-1} />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 sm:h-10">
              {rows.length > 0 ? d.chooseOther : d.choose}
            </button>
            {fileName && <p className="mt-2 truncate text-xs text-slate-500">{fileName}</p>}
          </div>

          {rows.length > 0 && (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{d.ready(rows.length)}</p>
                <button type="button" onClick={() => { setRows([]); setFileName(""); }}
                  className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                  <X className="h-4 w-4" />{d.clear}
                </button>
              </div>
              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500">
                    <tr>{d.headers.map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, PREVIEW).map((r, i) => (
                      <tr key={i}>
                        {([r.name, r.lastName, r.phone, r.email] as const).map((v, j) => (
                          <td key={j} className="max-w-[10rem] truncate px-3 py-1.5 text-slate-700">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW && <p className="text-xs text-slate-500">{d.more(rows.length - PREVIEW)}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => close(false)} className="h-11 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:h-10">
                  {d.cancel}
                </button>
                <button type="button" onClick={() => importExcel.mutate(rows)} disabled={importExcel.isPending}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 sm:h-10">
                  {importExcel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {importExcel.isPending ? d.importing : d.importN(rows.length)}
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
