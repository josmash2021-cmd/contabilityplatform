import { cn } from "@/lib/utils";

/**
 * The account's balance over the last 30 days (one point per day, from banks.overview), as a small
 * line with a soft fill, like the prototype's sparkSvg(). Blue when it went up, slate when it went down.
 */
export function Sparkline({ points, down, className }: { points: readonly number[]; down: boolean; className?: string }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = 116 / (points.length - 1);
  // A flat line sits in the middle instead of on the floor.
  const y = (v: number) => (max === min ? 17 : 30 - ((v - min) / range) * 26);
  const pts = points.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 116 32" preserveAspectRatio="none" aria-hidden="true" className={cn("block h-[34px] w-full", down ? "text-slate-500" : "text-blue-600", className)}>
      <polygon points={`0,32 ${pts} 116,32`} fill="currentColor" opacity={0.08} />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
