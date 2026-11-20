import { Globe } from "lucide-react";
import { useLang } from "./useI18n";
import type { Lang } from "./lang";

/** Compact ES / EN toggle. `tone` adapts it to dark or light backgrounds. */
export function LanguageSwitcher({ tone = "light", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  const { lang, setLang } = useLang();
  const options: Lang[] = ["es", "en"];
  const dark = tone === "dark";
  return (
    <div
      role="radiogroup"
      aria-label={lang === "es" ? "Idioma" : "Language"}
      className={`inline-flex items-center gap-1 rounded-lg p-0.5 text-xs font-semibold ${dark ? "bg-white/10 text-slate-300" : "bg-slate-100 text-slate-600"} ${className}`}
    >
      <Globe className="mx-1 h-3.5 w-3.5 opacity-70" aria-hidden />
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={lang === o}
          onClick={() => setLang(o)}
          className={`h-7 min-w-[2.25rem] rounded-md px-2 uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            lang === o ? (dark ? "bg-white text-slate-900" : "bg-white text-slate-900 shadow-sm") : dark ? "hover:text-white" : "hover:text-slate-900"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}
