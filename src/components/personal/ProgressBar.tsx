import { cn } from "@/lib/utils";

/** A progress bar that says its number to screen readers; `percent` can go past 100 (the bar stops at full). */
export function ProgressBar({ percent, label, tone = "blue", size = "md", className }: {
  percent: number;
  label: string;
  tone?: "blue" | "good" | "warn" | "bad";
  size?: "md" | "lg";
  className?: string;
}) {
  const pct = Math.max(0, Math.round(percent));
  const fill = { blue: "bg-blue-600", good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" }[tone];
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(pct, 100)}
      aria-valuetext={`${pct}%`}
      className={cn("w-full overflow-hidden rounded-full bg-slate-100", size === "lg" ? "h-3" : "h-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", fill)} style={{ width: `${pct === 0 ? 0 : Math.max(2, Math.min(pct, 100))}%` }} />
    </div>
  );
}
