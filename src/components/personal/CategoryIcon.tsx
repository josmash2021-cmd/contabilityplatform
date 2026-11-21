import { cn } from "@/lib/utils";
import { styleOf, subStyleOf } from "./personalUtils";

/** Round icon for a movement's category (same icons and tones as the personal home). */
export function CategoryIcon({ category, type, size = "md", className }: { category: string | null | undefined; type: string | null | undefined; size?: "md" | "lg"; className?: string }) {
  const { icon: Icon, tone } = styleOf(category, type);
  return (
    <span className={cn("grid shrink-0 place-items-center", size === "lg" ? "h-12 w-12 rounded-2xl" : "h-10 w-10 rounded-full", tone, className)} aria-hidden="true">
      <Icon className={size === "lg" ? "h-6 w-6" : "h-[18px] w-[18px]"} />
    </span>
  );
}

/** Rounded icon for a recurring charge, picked from the merchant's name. */
export function MerchantIcon({ name }: { name: string }) {
  const { icon: Icon, tone } = subStyleOf(name);
  return (
    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tone)} aria-hidden="true">
      <Icon className="h-5 w-5" />
    </span>
  );
}
