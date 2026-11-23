// The admin's small components: a person's status chip, their initials, a count bubble on the menu.
import { cn } from "@/lib/utils";
import type { AdminCopy } from "@/i18n/copy/admin";
import { DOT, TONE, initials, statusInfo, type UserStatus } from "./adminFormat";

export function StatusChip({ status, t, className }: { status: UserStatus; t: AdminCopy; className?: string }) {
  const { label, tone } = statusInfo(status, t);
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", TONE[tone], className)}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT[tone])} />
      {label}
    </span>
  );
}

export function Avatar({ name, email, className }: { name: string | null | undefined; email?: string | null; className?: string }) {
  return (
    <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-50 text-[13px] font-bold text-indigo-800", className)}>
      {initials(name, email)}
    </span>
  );
}

/** A count bubble on a menu item. */
export function MenuCount({ n, tone = "blue", className }: { n: number; tone?: "blue" | "red"; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold", tone === "red" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700", className)}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
