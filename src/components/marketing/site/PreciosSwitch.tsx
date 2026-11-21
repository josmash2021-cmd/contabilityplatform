// A segmented switch for the pricing page (group: Para ti / Para tu negocio; on phones,
// which plan the comparison shows). Looks like the one in the home page's pricing.
// Keyboard: it's a radio group, so Tab lands on the chosen option and the arrows move.
import { useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";

export type PreciosSwitchOption<T extends string> = { value: T; label: string; icon?: LucideIcon };

export function PreciosSwitch<T extends string>({ label, options, value, onChange, className = "" }: {
  /** What is being chosen, for screen readers. */
  label: string;
  options: PreciosSwitchOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const n = options.length;
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  const choose = (k: number) => {
    const next = (k + n) % n;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1
          : e.key === "Home" ? 0
            : e.key === "End" ? n - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    choose(to);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`relative grid rounded-2xl bg-slate-200/70 p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-xl bg-white shadow-sm motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
        style={{ width: `calc((100% - 8px) / ${n})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o, i) => {
        const on = i === index;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => { buttons.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative z-10 inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-12 sm:px-7 sm:text-[15px] ${
              on ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {/* Icons only where there's room: on phones the full label matters more. */}
            {Icon && <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
