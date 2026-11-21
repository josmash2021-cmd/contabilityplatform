import { useId, useState } from "react";
import { toast } from "sonner";
import { Copy, FileDown, Info, Mail, MessageCircle, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { mailtoUrl, whatsappUrl, type SendChannel } from "../../../api/lib/invoices";
import { btn } from "./ui";
import { copyText } from "./shared";

export type SendCopy = {
  to: string;
  noContact: string;
  whatsapp: string;
  email: string;
  pdf: string;
  copy: string;
  share: string;
  message: string;
  honest: string;
  pdfHint: string;
  copied: string;
  copyFailed: string;
  done: string;
};

/**
 * Hands an invoice, a reminder or a quote to the client through the user's own apps: WhatsApp
 * (wa.me), email (mailto), the PDF from the print view, the phone's share sheet or the clipboard.
 * The app has no email service, so nothing is sent from the server: `onSent` only records how.
 */
export function SendDialog({ open, onClose, title, recipient, phone, email, subject, initialText, withPdf, onPdf, onSent, t }: {
  open: boolean;
  onClose: () => void;
  title: string;
  recipient: string | null;
  phone: string | null;
  email: string | null;
  subject: string;
  initialText: string;
  /** Offer "Descargar PDF" (the print view must be mounted by the caller). */
  withPdf: boolean;
  onPdf?: () => void;
  onSent: (channel: SendChannel) => void;
  t: SendCopy;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden bg-white p-0 sm:max-h-[90vh] sm:max-w-[520px] sm:rounded-2xl">
        <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left">
          <DialogTitle className="text-[17px] font-[750] text-slate-900">{title}</DialogTitle>
          <DialogDescription className="sr-only">{t.honest}</DialogDescription>
        </DialogHeader>
        {open && (
          <SendBody
            recipient={recipient} phone={phone} email={email} subject={subject} initialText={initialText}
            withPdf={withPdf} onPdf={onPdf} onSent={onSent} onClose={onClose} t={t}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SendBody({ recipient, phone, email, subject, initialText, withPdf, onPdf, onSent, onClose, t }: {
  recipient: string | null;
  phone: string | null;
  email: string | null;
  subject: string;
  initialText: string;
  withPdf: boolean;
  onPdf?: () => void;
  onSent: (channel: SendChannel) => void;
  onClose: () => void;
  t: SendCopy;
}) {
  const id = useId();
  const [text, setText] = useState(initialText);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const contact = [phone, email].filter(Boolean).join(" · ");

  const copy = async () => {
    if (await copyText(text)) {
      toast.success(t.copied);
      onSent("copy");
    } else toast.error(t.copyFailed);
  };
  const share = async () => {
    try {
      await navigator.share({ title: subject, text });
      onSent("share");
    } catch {
      /* the user closed the share sheet */
    }
  };

  const tile = "min-h-12 flex-col gap-1 py-2 sm:min-h-[60px]";
  return (
    <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-4 pb-4 pt-2">
      <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm">
        <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">{t.to}</span>
        <b className="block break-words text-slate-900">{recipient || "—"}</b>
        <span className="block break-words text-xs text-slate-500">{contact || t.noContact}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <a
          href={whatsappUrl(phone, text)} target="_blank" rel="noopener noreferrer"
          onClick={() => onSent("whatsapp")}
          className={cn(btn(tile), "text-emerald-700")}
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />{t.whatsapp}
        </a>
        <a href={mailtoUrl(email, subject, text)} onClick={() => onSent("email")} className={btn(tile)}>
          <Mail className="h-5 w-5 text-blue-600" aria-hidden="true" />{t.email}
        </a>
        {withPdf && onPdf && (
          <button type="button" className={btn(tile)} onClick={() => { onPdf(); onSent("pdf"); }} title={t.pdfHint}>
            <FileDown className="h-5 w-5 text-slate-500" aria-hidden="true" />{t.pdf}
          </button>
        )}
        <button type="button" className={btn(tile)} onClick={() => void copy()}>
          <Copy className="h-5 w-5 text-slate-500" aria-hidden="true" />{t.copy}
        </button>
        {canShare && (
          <button type="button" className={btn(tile)} onClick={() => void share()}>
            <Share2 className="h-5 w-5 text-slate-500" aria-hidden="true" />{t.share}
          </button>
        )}
      </div>

      <label htmlFor={`${id}-msg`} className="grid gap-1 text-[13px] font-semibold text-slate-900">
        {t.message}
        <textarea
          id={`${id}-msg`} value={text} rows={8} onChange={(e) => setText(e.target.value)}
          className="w-full resize-y rounded-[10px] border border-slate-200 bg-white px-2.5 py-2 font-mono text-[13px] font-normal leading-relaxed text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </label>

      <p className="flex gap-2 rounded-[10px] bg-blue-50 px-3 py-2.5 text-[13px] text-slate-700">
        <Info className="mt-0.5 h-4 w-4 flex-none text-blue-600" aria-hidden="true" />
        <span>{t.honest}{withPdf ? ` ${t.pdfHint}` : ""}</span>
      </p>
      <button type="button" className={btn("w-full")} onClick={onClose}>{t.done}</button>
    </div>
  );
}
