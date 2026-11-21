import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PickItem = { value: string; label: string; icon?: ReactNode };

/** The prototype's filter button with a menu (pickMenu): icon + current choice + chevron; the chosen one has a check. */
export function PickMenu({ label, icon, current, items, onPick, className }: {
  /** What the menu picks ("Categoría"), for screen readers. */
  label: string;
  icon?: ReactNode;
  current: string;
  items: readonly PickItem[];
  onPick: (value: string) => void;
  className?: string;
}) {
  const now = items.find((i) => i.value === current);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`${label}: ${now?.label ?? ""}`}
          className={cn("inline-flex min-h-11 max-w-full items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 data-[state=open]:border-blue-600 data-[state=open]:ring-[3px] data-[state=open]:ring-blue-50 sm:min-h-10", className)}>
          {icon ?? now?.icon}
          <span className="truncate">{now?.label ?? label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] w-72 overflow-y-auto rounded-[14px] p-1.5">
        {items.map((i) => (
          <DropdownMenuItem key={i.value} onSelect={() => onPick(i.value)} className="flex min-h-10 items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm">
            <span className="grid w-5 shrink-0 place-items-center text-slate-500">{i.icon}</span>
            <span className={cn("min-w-0 flex-1 truncate", i.value === current && "font-semibold text-blue-600")}>{i.label}</span>
            {i.value === current && <Check className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
