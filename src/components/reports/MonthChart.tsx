import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ReportesCopy } from "@/i18n/copy/reportes";
import type { SeriesMonth } from "../../../api/lib/reportBooks";
import { money0 } from "./ui";

/**
 * "Mes por mes": what came in (blue) and went out (gray) in each of the last 12 months, like the prototype's
 * rpChart. The months of the chosen period are fully drawn; the rest are faded. Hover, focus or tap a month
 * to read its numbers.
 */
export function MonthChart({ months, highlight, c }: { months: SeriesMonth[]; highlight: string[]; c: ReportesCopy }) {
  const [active, setActive] = useState<string | null>(null);
  const W = 600;
  const base = 136;
  const bw = 15;
  const gap = W / 12;
  const max = Math.max(1, ...months.map((m) => Math.max(m.in, m.out)));
  const shown = months.find((m) => m.key === active) ?? null;
  const tip = (m: SeriesMonth) => c.chart.tip(`${c.monthName(m.month)} ${m.year}`, money0(m.in), money0(m.out));
  const empty = months.every((m) => m.in === 0 && m.out === 0);

  return (
    <div>
      <svg viewBox={`0 0 ${W} 160`} role="img" aria-label={c.chart.aria} className="mt-1.5 block h-auto w-full [&_text]:fill-slate-500 [&_text]:text-[19px] sm:[&_text]:text-[11px]">
        <line x1={0} x2={W} y1={base} y2={base} className="stroke-slate-200" />
        {months.map((m, i) => {
          const x = i * gap + gap / 2;
          const hi = (m.in / max) * 118;
          const ho = (m.out / max) * 118;
          const on = highlight.includes(m.key) || active === m.key;
          return (
            <g
              key={m.key}
              tabIndex={0}
              role="button"
              aria-label={tip(m)}
              aria-pressed={active === m.key}
              onMouseEnter={() => setActive(m.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(m.key)}
              onBlur={() => setActive(null)}
              onClick={() => setActive((a) => (a === m.key ? null : m.key))}
              className={cn("cursor-pointer outline-none transition-opacity duration-150 focus-visible:[&_rect]:stroke-blue-600 focus-visible:[&_rect]:[stroke-width:2]", on ? "opacity-100" : "opacity-40 hover:opacity-100")}
            >
              <title>{tip(m)}</title>
              <rect x={i * gap} y={0} width={gap} height={160} fill="transparent" />
              <rect x={(x - bw - 1).toFixed(1)} y={(base - hi).toFixed(1)} width={bw} height={hi.toFixed(1)} rx={3} className="fill-blue-600" />
              <rect x={(x + 1).toFixed(1)} y={(base - ho).toFixed(1)} width={bw} height={ho.toFixed(1)} rx={3} className="fill-slate-400" />
              <text x={x.toFixed(1)} y={base + 17} textAnchor="middle">{c.monthShort(m.month)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-900">
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-blue-600" aria-hidden="true" />{c.chart.in}</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-slate-400" aria-hidden="true" />{c.chart.out}</span>
        <span className="text-slate-500" aria-live="polite">{empty ? c.chart.empty : shown ? <b className="font-semibold text-slate-900 tabular-nums">{tip(shown)}</b> : c.chart.hint}</span>
      </div>
    </div>
  );
}
