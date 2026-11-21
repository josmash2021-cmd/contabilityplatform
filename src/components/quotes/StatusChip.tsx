import { CircleCheck, CircleX, FilePen, Receipt, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "../../../api/lib/quotes";

const QUOTE_STYLE: Record<QuoteStatus, { className: string; icon: LucideIcon }> = {
  draft: { className: "bg-slate-100 text-slate-700", icon: FilePen },
  sent: { className: "bg-blue-50 text-blue-700 ring-1 ring-blue-200", icon: Send },
  accepted: { className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200", icon: CircleCheck },
  rejected: { className: "bg-red-50 text-red-700 ring-1 ring-red-200", icon: CircleX },
  converted: { className: "bg-slate-900 text-white", icon: Receipt },
};

/** A small rounded label: always icon + text, so the meaning never rests on color alone. */
export function Chip({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

export function QuoteStatusChip({ status, label }: { status: QuoteStatus; label: string }) {
  const style = QUOTE_STYLE[status];
  return <Chip icon={style.icon} label={label} className={style.className} />;
}
