import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** The number of a part of "before sending" (1 situación, 2 documentos, 3 autoriza): a check once it's done. */
export function TaxStepNum({ n, done }: { n: number; done: boolean }) {
  return (
    <span aria-hidden="true"
      className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-300",
        done ? "bg-emerald-600 text-white" : "bg-blue-600 text-white")}>
      {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
    </span>
  );
}
