import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { reportesCopy, type ReportesCopy } from "@/i18n/copy/reportes";
import { CARD, CHART, money, moneyTick, type MonthTotals } from "./format";

/** One day of the month chart. `on` = inside the period being looked at (Hoy / Semana). */
export type DayDatum = { day: number; long: string; total: number; count: number; on: boolean };

type Common = { loading: boolean; stale: boolean };
type DailyProps = Common & {
  kind: "daily";
  days: DayDatum[];
  monthLabel: string;
  /** Hoy / Semana highlight part of the month; Mes shows it all in one color. */
  highlight: "today" | "week" | null;
  /** The chart groups days by the server's clock; say so when its total differs from the summary. */
  clockNote: boolean;
};
type YearProps = Common & { kind: "year"; months: MonthTotals[]; year: number; lastMonth: number };

const PLOT_HEIGHT = 232;

/** The page's one chart: sales by day for a month, or money in vs out by month for a year. Table view included. */
export function MoneyChart(props: DailyProps | YearProps) {
  const t = useCopy(reportesCopy).chart;
  const [asTable, setAsTable] = useState(false);

  const daily = props.kind === "daily";
  const title = daily ? t.dailyTitle : t.yearTitle;
  const dailyTotal = daily ? props.days.reduce((s, d) => s + d.total, 0) : 0;
  const sub = daily ? t.dailySub(props.monthLabel, money(dailyTotal)) : t.yearSub(props.year);
  const empty = daily ? props.days.every((d) => d.total <= 0) : props.months.every((m) => m.in <= 0 && m.out <= 0);
  const ticks = niceTicks(daily ? Math.max(0, ...props.days.map((d) => d.total)) : Math.max(0, ...props.months.flatMap((m) => [m.in, m.out])));

  let insight = "";
  if (daily) {
    // Hoy has one day; Semana looks at its own days; Mes at the whole month.
    const pool = props.highlight === "week" ? props.days.filter((d) => d.on) : props.days;
    const best = props.highlight === "today" ? null : pool.reduce<DayDatum | null>((b, d) => (d.total > (b?.total ?? 0) ? d : b), null);
    if (best) insight = t.best(best.long, money(best.total));
  } else {
    const best = props.months.reduce<MonthTotals | null>((b, m) => (m.net > (b?.net ?? 0) ? m : b), null);
    if (best) insight = t.bestMonth(best.long, money(best.net));
  }

  return (
    <section className={CARD} aria-labelledby="rep-chart-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="rep-chart-title" className="font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{sub}</p>
        </div>
        {!empty && <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-9"
        >
          {asTable ? <BarChart3 className="h-4 w-4" aria-hidden="true" /> : <Table2 className="h-4 w-4" aria-hidden="true" />}
          {asTable ? t.showChart : t.showTable}
        </button>}
      </div>

      <Legend {...props} t={t} />

      <div className={cn("mt-3 transition-opacity", props.stale && "opacity-60")} aria-busy={props.stale || undefined}>
        {props.loading ? (
          <Skeleton className="w-full rounded-xl bg-slate-100" style={{ height: PLOT_HEIGHT }} />
        ) : empty ? (
          <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 text-center" style={{ height: PLOT_HEIGHT }}>
            <p className="px-6 text-sm text-slate-500">{daily ? t.emptyDaily : t.emptyYear}</p>
          </div>
        ) : asTable ? (
          daily ? <DailyTable days={props.days} t={t} /> : <YearTable months={props.months.filter((m) => m.month <= props.lastMonth)} t={t} />
        ) : (
          <div style={{ height: PLOT_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              {daily ? (
                <BarChart data={props.days} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="18%" accessibilityLayer title={title} desc={t.aria(title, sub)}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: CHART.grid }} tick={{ fill: CHART.axis, fontSize: 11 }} interval="preserveStartEnd" minTickGap={4} />
                  <YAxis tickFormatter={moneyTick} tickLine={false} axisLine={false} tick={{ fill: CHART.axis, fontSize: 11 }} width={48} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} interval={0} />
                  <Tooltip cursor={{ fill: CHART.hover }} content={<DailyTip t={t} />} isAnimationActive={false} />
                  <Bar dataKey="total" name={t.sales} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                    {props.days.map((d) => <Cell key={d.day} fill={props.highlight && !d.on ? CHART.rest : CHART.accent} />)}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart data={props.months} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%" accessibilityLayer title={title} desc={t.aria(title, sub)}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART.grid }} tick={{ fill: CHART.axis, fontSize: 11 }} interval={0} />
                  <YAxis tickFormatter={moneyTick} tickLine={false} axisLine={false} tick={{ fill: CHART.axis, fontSize: 11 }} width={48} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} interval={0} />
                  <Tooltip cursor={{ fill: CHART.hover }} content={<YearTip t={t} />} isAnimationActive={false} />
                  <Bar dataKey="in" name={t.in} fill={CHART.in} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                  <Bar dataKey="out" name={t.out} fill={CHART.out} radius={[4, 4, 0, 0]} maxBarSize={16} isAnimationActive={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {!props.loading && !empty && insight && <p className="mt-3 text-sm text-slate-600">{insight}</p>}
      {daily && props.clockNote && !props.loading && <p className="mt-1 text-xs text-slate-500">{t.note}</p>}
    </section>
  );
}

type ChartCopy = ReportesCopy["chart"];

/** Clean axis steps (1, 2, 2.5 or 5 × 10ⁿ), about four of them, from 0 up past the highest value. */
function niceTicks(max: number): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step);
  return Array.from({ length: top + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

function Legend(props: (DailyProps | YearProps) & { t: ChartCopy }) {
  const { t } = props;
  let items: Array<{ color: string; label: string }> = [];
  if (props.kind === "year") items = [{ color: CHART.in, label: t.in }, { color: CHART.out, label: t.out }];
  else if (props.highlight) items = [{ color: CHART.accent, label: t.highlight[props.highlight] }, { color: CHART.rest, label: t.restOfMonth }];
  if (items.length === 0) return null; // one series: the title names it
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: it.color }} aria-hidden="true" />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function TipBox({ title, rows }: { title: string; rows: Array<{ color?: string; label: string; value: string }> }) {
  return (
    <div className="min-w-[150px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              {r.color && <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: r.color }} aria-hidden="true" />}
              {r.label}
            </span>
            <span className="text-sm font-semibold tabular-nums text-slate-900">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DailyTip({ active, payload, t }: TooltipProps<number, string> & { t: ChartCopy }) {
  const d = payload?.[0]?.payload as DayDatum | undefined;
  if (!active || !d) return null;
  return <TipBox title={d.long} rows={[{ label: t.sales, value: money(d.total) }, { label: t.count, value: String(d.count) }]} />;
}

function YearTip({ active, payload, t }: TooltipProps<number, string> & { t: ChartCopy }) {
  const m = payload?.[0]?.payload as MonthTotals | undefined;
  if (!active || !m) return null;
  return (
    <TipBox
      title={m.long}
      rows={[
        { color: CHART.in, label: t.in, value: money(m.in) },
        { color: CHART.out, label: t.out, value: money(m.out) },
        { label: t.kept, value: money(m.net) },
      ]}
    />
  );
}

const TH = "py-2 text-xs font-medium text-slate-500";
const TD = "py-2 text-sm tabular-nums text-slate-900";

function DailyTable({ days, t }: { days: DayDatum[]; t: ChartCopy }) {
  const rows = days.filter((d) => d.total > 0 || d.count > 0);
  const total = rows.reduce((s, d) => s + d.total, 0);
  const count = rows.reduce((s, d) => s + d.count, 0);
  return (
    <table className="w-full">
      <caption className="sr-only">{t.dailyTitle}</caption>
      <thead>
        <tr className="border-b border-slate-200">
          <th scope="col" className={cn(TH, "text-left")}>{t.day}</th>
          <th scope="col" className={cn(TH, "text-right")}>{t.sales}</th>
          <th scope="col" className={cn(TH, "text-right")}>{t.count}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((d) => (
          <tr key={d.day}>
            <th scope="row" className="py-2 text-left text-sm font-normal text-slate-700">{d.long}</th>
            <td className={cn(TD, "text-right")}>{money(d.total)}</td>
            <td className={cn(TD, "text-right text-slate-600")}>{d.count}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-slate-200">
          <th scope="row" className="py-2 text-left text-sm font-semibold text-slate-900">{t.total}</th>
          <td className={cn(TD, "text-right font-semibold")}>{money(total)}</td>
          <td className={cn(TD, "text-right font-semibold")}>{count}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function YearTable({ months, t }: { months: MonthTotals[]; t: ChartCopy }) {
  const sum = months.reduce((s, m) => ({ in: s.in + m.in, out: s.out + m.out, net: s.net + m.net }), { in: 0, out: 0, net: 0 });
  return (
    <>
      {/* Desktop and tablet: a real table */}
      <table className="hidden w-full sm:table">
        <caption className="sr-only">{t.yearTitle}</caption>
        <thead>
          <tr className="border-b border-slate-200">
            <th scope="col" className={cn(TH, "text-left")}>{t.month}</th>
            <th scope="col" className={cn(TH, "text-right")}>{t.in}</th>
            <th scope="col" className={cn(TH, "text-right")}>{t.out}</th>
            <th scope="col" className={cn(TH, "text-right")}>{t.kept}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row" className="py-2 text-left text-sm font-normal capitalize text-slate-700">{m.long}</th>
              <td className={cn(TD, "text-right")}>{money(m.in)}</td>
              <td className={cn(TD, "text-right")}>{money(m.out)}</td>
              <td className={cn(TD, "text-right font-semibold", m.net < 0 && "text-red-700")}>{money(m.net)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200">
            <th scope="row" className="py-2 text-left text-sm font-semibold text-slate-900">{t.total}</th>
            <td className={cn(TD, "text-right font-semibold")}>{money(sum.in)}</td>
            <td className={cn(TD, "text-right font-semibold")}>{money(sum.out)}</td>
            <td className={cn(TD, "text-right font-semibold", sum.net < 0 && "text-red-700")}>{money(sum.net)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Phone: one stacked row per month, no sideways scrolling */}
      <ul className="divide-y divide-slate-100 sm:hidden" aria-label={t.yearTitle}>
        {[...months, { month: 0, label: "", long: t.total, ...sum }].map((m) => (
          <li key={m.month} className={cn("py-2.5", m.month === 0 && "border-t border-slate-200")}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn("text-sm capitalize text-slate-700", m.month === 0 && "font-semibold text-slate-900")}>{m.long}</span>
              <span className={cn("text-sm font-semibold tabular-nums text-slate-900", m.net < 0 && "text-red-700")}>{t.kept}: {money(m.net)}</span>
            </div>
            <p className="mt-0.5 text-xs tabular-nums text-slate-500">{t.in} {money(m.in)} · {t.out} {money(m.out)}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
