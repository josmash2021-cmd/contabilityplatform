import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { useCopy } from "@/i18n/useI18n";
import { taxesCopy } from "@/i18n/copy/taxes";
import { base64ToBlobUrl } from "@/lib/taxFiles";

type Props = { docId: number | null; title?: string; onClose: () => void };

/**
 * Opens one tax document (decrypted by the server for its owner or a preparer).
 * Photos show inline; PDFs in a frame, with a download button for phones that can't show them.
 */
export function TaxFileViewer({ docId, title, onClose }: Props) {
  const t = useCopy(taxesCopy);
  const { data, isLoading, isError } = trpc.tax.file.useQuery({ id: docId ?? 0 }, { enabled: docId !== null, staleTime: 60_000, gcTime: 0 });
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const u = base64ToBlobUrl(data.dataBase64, data.mimeType);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL exists only while the file is open
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data]);

  const isPdf = data?.mimeType === "application/pdf";
  const showUrl = docId !== null && data ? url : null;

  return (
    <Dialog open={docId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left">
          <DialogTitle className="truncate pr-8 text-base font-semibold text-slate-900">{title || data?.fileName || t.view}</DialogTitle>
          <DialogDescription className="truncate text-xs text-slate-500">{data?.fileName}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[40vh] items-center justify-center bg-slate-50 p-3">
          {isLoading && <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label={t.loading} />}
          {isError && <p className="text-sm text-red-600">{t.errors.generic}</p>}
          {showUrl && (isPdf ? (
            <iframe title={data?.fileName} src={showUrl} className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white" />
          ) : (
            <img src={showUrl} alt={title || data?.fileName || ""} className="max-h-[70vh] w-auto rounded-lg object-contain" />
          ))}
        </div>
        {showUrl && (
          <div className="flex justify-end border-t border-slate-100 px-5 py-3">
            <a href={showUrl} download={data?.fileName} className="inline-flex h-11 min-w-0 max-w-full items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:h-10">
              <Download className="h-4 w-4 shrink-0" /> <span className="truncate">{data?.fileName}</span>
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
