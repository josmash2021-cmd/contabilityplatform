import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Building2, Eye, EyeOff, Loader2, User } from "lucide-react";
import { useCopy } from "@/i18n/useI18n";
import { authCopy } from "@/i18n/copy/auth";
import { fx } from "@/lib/fx";

export type AccountMode = "business" | "personal";

export const inputCls =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-[15px] text-slate-900 placeholder:text-slate-400 shadow-sm transition-[border-color,box-shadow] duration-200 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15 disabled:opacity-60";

export function AuthHeading({ title, subtitle, eyebrow }: { title: string; subtitle?: ReactNode; eyebrow?: string }) {
  return (
    <div data-fx-group>
      {eyebrow && <p data-fx="slide" style={fx(160, 0)} className="text-sm font-semibold text-blue-600">{eyebrow}</p>}
      <h1 data-fx="focus" style={fx(220, 1)} className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
      {subtitle && <p data-fx="rise" style={fx(320, 2)} className="mt-2 text-[15px] leading-relaxed text-slate-600">{subtitle}</p>}
    </div>
  );
}

/** Business / Personal segmented control with a sliding indicator. */
export function ModeToggle({ value, onChange }: { value: AccountMode; onChange: (m: AccountMode) => void }) {
  const { ui } = useCopy(authCopy);
  const options: Array<{ value: AccountMode; label: string; icon: typeof Building2 }> = [
    { value: "business", label: ui.business, icon: Building2 },
    { value: "personal", label: ui.personal, icon: User },
  ];
  return (
    <div role="radiogroup" aria-label={ui.modeLabel} data-fx="grow" style={fx(520)} className="relative grid grid-cols-2 rounded-xl bg-slate-100 p-1">
      <span
        aria-hidden
        className="absolute bottom-1 left-0 top-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm ring-1 ring-slate-200 transition-transform duration-300 ease-out"
        style={{ transform: value === "business" ? "translateX(4px)" : "translateX(calc(100% + 4px))" }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`relative z-10 inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            value === o.value ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          <o.icon className="h-4 w-4" /> {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({
  label, hint, error, action, children, htmlFor,
}: { label: string; hint?: ReactNode; error?: string; action?: ReactNode; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-800">{label}</label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-red-600" role="alert">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function PasswordInput({ id, ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  const { ui } = useCopy(authCopy);
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} id={id} type={show ? "text" : "password"} className={`${inputCls} pr-12`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? ui.hidePassword : ui.showPassword}
        aria-controls={id}
        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function SubmitButton({ loading, children }: { loading?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[15px] font-semibold text-white shadow-sm transition-all duration-200 hover:bg-slate-800 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
