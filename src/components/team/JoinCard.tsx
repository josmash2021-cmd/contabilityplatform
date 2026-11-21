import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useCopy } from "@/i18n/useI18n";
import { teamCopy } from "@/i18n/copy/team";
import { initialsOf } from "./ui";
import type { TeamRole } from "./roles";

/** The business's logo (or its initials) and name, at the top of the invitation page. */
export function JoinBrand({ companyName, logo, size = 38 }: { companyName: string | null; logo: string | null; size?: number }) {
  const t = useCopy(teamCopy).join;
  const name = companyName || "Personal & Business Solutions";
  return (
    <div className="flex items-center gap-2.5">
      {logo
        ? <img src={logo} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-[10px] bg-white object-contain ring-1 ring-slate-200" />
        : <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-[10px] bg-slate-900 text-sm font-extrabold text-white" aria-hidden>{initialsOf(name) || "·"}</span>}
      <div className="min-w-0">
        <b className="block truncate text-[15px] font-bold text-slate-900">{name}</b>
        <span className="block text-xs text-slate-500">{t.brandSub}</span>
      </div>
    </div>
  );
}

/** "María López te invitó como Empleado. Cobrar en Cobrar…" */
export function JoinHeading({ companyName, ownerName, role }: { companyName: string | null; ownerName: string | null; role: TeamRole }) {
  const tt = useCopy(teamCopy);
  const t = tt.join;
  const [a, b, c] = t.text(ownerName ?? "", tt.roles[role].name);
  return (
    <>
      <h2 className="mt-[18px] text-[22px] font-[750] leading-tight text-slate-900">{companyName ? t.title(companyName) : t.titleGeneric}</h2>
      <p className="mt-1 text-sm text-slate-500">{a}<b className="font-semibold text-slate-900">{b}</b>{c} {tt.roleCan[role].can[0]}.</p>
    </>
  );
}

/** A label above its control, like the prototype's `.form label`. */
export function FormField({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-slate-900">{label}</label>
      {children}
      {hint && <small className="text-xs text-slate-500">{hint}</small>}
    </div>
  );
}

/** "Soy nuevo / Ya tengo cuenta" (the prototype's `.seg`). */
export function JoinModeSwitch({ mode, onChange, disabled }: { mode: "new" | "existing"; onChange?: (m: "new" | "existing") => void; disabled?: boolean }) {
  const t = useCopy(teamCopy).join;
  return (
    <div role="group" aria-label={t.modeLabel} className="mb-1 mt-3 inline-grid grid-cols-2 gap-1 rounded-[10px] bg-slate-100 p-1">
      {(["new", "existing"] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} disabled={disabled} onClick={() => onChange?.(m)}
          className={cn("min-h-9 rounded-lg px-3 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            mode === m ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-900")}>
          {m === "new" ? t.newUser : t.haveAccount}
        </button>
      ))}
    </div>
  );
}

/**
 * What the invited person sees when they open the link, drawn with the real page's pieces and the
 * invitation's real details. Inert: it's a picture of the page, not a second form.
 */
export function JoinCardPreview({ companyName, logo, ownerName, role, email, name, expires }: {
  companyName: string | null; logo: string | null; ownerName: string | null; role: TeamRole; email: string; name: string | null; expires: string | null;
}) {
  const t = useCopy(teamCopy).join;
  const box = "min-h-10 w-full rounded-[10px] border border-slate-200 px-2.5 py-2 text-sm";
  return (
    <div inert className="mx-auto max-w-[420px] select-none rounded-xl bg-white p-5 shadow-[0_10px_28px_-16px_rgba(15,23,42,0.45)] ring-1 ring-slate-200">
      <JoinBrand companyName={companyName} logo={logo} />
      <JoinHeading companyName={companyName} ownerName={ownerName} role={role} />
      <JoinModeSwitch mode="new" />
      <div className="mt-2 grid gap-3">
        <FormField label={t.email} hint={t.emailFixed}><div className={`${box} bg-slate-100 text-slate-500`}>{email}</div></FormField>
        <FormField label={t.name}><div className={`${box} text-slate-900`}>{name || " "}</div></FormField>
        <FormField label={t.password} hint={t.passwordHint}><div className={`${box} text-slate-400`}>{t.samplePassword}</div></FormField>
        <span className="grid min-h-[46px] place-items-center rounded-[10px] bg-blue-600 text-[15px] font-semibold text-white">{t.create}</span>
      </div>
      {expires && <p className="mt-3 text-center text-xs text-slate-500">{t.expires(expires)}</p>}
    </div>
  );
}
