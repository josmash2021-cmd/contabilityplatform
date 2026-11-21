// "Tu semana de pagos" (.wk-card): today and the next six days, with what's due each day.
// Today has a blue outline; a day with bills is amber. On phones the days scroll sideways.
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { vendorsCopy } from "@/i18n/copy/vendors";
import { CARD, H3, fmt0 } from "@/components/expenses/ui";
import type { WeekDay } from "../../../api/lib/expenses";

export function PaymentWeek({ days }: { days: readonly WeekDay[] }) {
  const c = useCopy(vendorsCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  return (
    <section className={cn(CARD, "mt-3.5")} aria-labelledby="vd-week">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="vd-week" className={H3}>{c.proto.week.title}</h2>
        <span className="text-xs text-slate-500">{c.proto.week.note}</span>
      </div>
      <ol className="grid grid-cols-[repeat(7,66px)] gap-1.5 overflow-x-auto [scrollbar-width:none] md:grid-cols-7 [&::-webkit-scrollbar]:hidden">
        {days.map((d, i) => {
          const [y, m, dd] = d.date.split("-").map(Number);
          const date = new Date(y, m - 1, dd);
          const name = date.toLocaleDateString(locale, { weekday: "short" }).replace(".", "");
          const long = date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
          const has = d.count > 0;
          return (
            <li
              key={d.date}
              aria-label={has ? c.proto.week.dayAria(long, fmt0(d.totalCents / 100), d.vendors.join(", ")) : c.proto.week.dayNone(long)}
              className={cn(
                "grid min-w-0 content-start justify-items-center gap-px rounded-[10px] px-1 py-2 text-center text-xs text-slate-500",
                has ? "bg-amber-50" : "bg-slate-100",
                i === 0 && "shadow-[inset_0_0_0_2px_theme(colors.blue.600)]",
              )}
            >
              <span aria-hidden="true">{name.charAt(0).toUpperCase() + name.slice(1)}</span>
              <b className="text-base text-slate-900" aria-hidden="true">{dd}</b>
              {has ? (
                <>
                  <em className="text-[13px] font-bold not-italic tabular-nums text-slate-900" aria-hidden="true">{fmt0(d.totalCents / 100)}</em>
                  <small className="max-w-full truncate text-[11px]" aria-hidden="true">{d.vendors[0]}</small>
                </>
              ) : (
                <small className="text-[11px]" aria-hidden="true">—</small>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
