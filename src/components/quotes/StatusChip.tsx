import { CircleCheck, CircleX, FilePen, Receipt, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteStatus } from "../../../api/lib/quotes";

const QUOTE_STYLE: Record<QuoteStatus, { className: string; icon: LucideIcon }> = {
  draft: { className: "bg-neutral-100 text-neutral-700", icon: FilePen },
  sent: { className: "bg-sky-50 text-sky-800", icon: Send },
  accepted: { className: "bg-emerald-50 text-emerald-700", icon: CircleCheck },
  rejected: { className: "bg-red-50 text-red-700", icon: CircleX },
  converted: { className: "bg-neutral-900 text-white", icon: Receipt },
};

/** A small rounded label: always icon + text, so the meaning never rests on color alone. */
export function Chip({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", className)}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function QuoteStatusChip({ status, label }: { status: QuoteStatus; label: string }) {
  const style = QUOTE_STYLE[status];
  return <Chip icon={style.icon} label={label} className={style.className} />;
}
