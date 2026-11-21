import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Copy, Link2, Loader2, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { teamCopy } from "@/i18n/copy/team";
import { JoinCardPreview, FormField } from "./JoinCard";
import { RolePreview } from "./RolePreview";
import type { TeamRole } from "./roles";
import { BTN, BTN_PRIMARY, FOCUS, INPUT } from "./ui";

export type Company = { name: string | null; logo: string | null };
const DIALOG = "flex flex-col gap-0 overflow-hidden bg-white p-0 sm:max-h-[90vh] sm:rounded-2xl";
const longDate = (d: Date | string, locale: string) => new Date(d).toLocaleDateString(locale, { day: "numeric", month: "long" });

async function copyText(text: string, ok: string) {
  try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error(text); }
}

// ── Invite: the form, then the link to send (copy / WhatsApp) and what they'll see ──

export type InviteStart = { email: string; name: string | null; role: TeamRole };

export function InviteDialog({ open, onClose, start, staffFull, accountantTaken, company, ownerName, onCreated }: {
  open: boolean; onClose: () => void; start: InviteStart | null;
  staffFull: boolean; accountantTaken: boolean; company: Company; ownerName: string | null; onCreated: () => void;
}) {
  const t = useCopy(teamCopy);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${DIALOG} sm:max-w-[480px]`}>
        <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left">
          <DialogTitle className="text-[17px] font-[750] text-slate-900">{t.invite.title}</DialogTitle>
          <DialogDescription className="sr-only">{t.invite.note}</DialogDescription>
        </DialogHeader>
        {open && <InviteBody start={start} staffFull={staffFull} accountantTaken={accountantTaken} company={company} ownerName={ownerName} onCreated={onCreated} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function InviteBody({ start, staffFull, accountantTaken, company, ownerName, onCreated, onClose }: {
  start: InviteStart | null; staffFull: boolean; accountantTaken: boolean; company: Company; ownerName: string | null; onCreated: () => void; onClose: () => void;
}) {
  const t = useCopy(teamCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const [name, setName] = useState(start?.name ?? "");
  const [email, setEmail] = useState(start?.email ?? "");
  const [role, setRole] = useState<TeamRole>(start?.role ?? (staffFull && !accountantTaken ? "accountant" : "staff"));
  const [showPreview, setShowPreview] = useState(false);
  const invite = trpc.team.invite.useMutation({ onSuccess: () => onCreated(), onError: (e) => toast.error(e.message) });
  const r = invite.data;
  // Re-sending to someone already invited replaces their link, so their own seat doesn't block it.
  const relink = !!start && start.email.toLowerCase() === email.trim().toLowerCase() && start.role === role;
  const blocked = !relink && ((role === "staff" && staffFull) || (role === "accountant" && accountantTaken));

  if (r) {
    const message = t.invite.message(r.link, r.name);
    return (
      <div className="overflow-y-auto px-4 pb-4">
        <div className="grid justify-items-center gap-2 px-1.5 pt-1.5 text-center" role="status">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
          <p className="text-[15px] font-semibold text-slate-900">{t.invite.readyTitle}</p>
          <p className="text-sm text-slate-700">{t.invite.readyText(r.email, t.roles[r.role].name)}</p>
        </div>
        <div className="mt-3">
          <FormField label={t.invite.linkLabel} htmlFor="tm-link">
            <div className="flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-100 px-2.5">
              <Link2 className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <input id="tm-link" readOnly value={r.link} onFocus={(e) => e.currentTarget.select()} className="min-h-10 min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-700 outline-none" />
            </div>
          </FormField>
          <div className="mt-2.5 grid gap-2 sm:flex">
            <button type="button" className={BTN} onClick={() => copyText(r.link, t.invite.copied)}><Copy className="h-4 w-4" />{t.invite.copy}</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"
              className={`inline-flex min-h-10 items-center justify-center gap-[7px] rounded-[10px] bg-[#1DA851] px-3.5 text-sm font-semibold text-white hover:bg-[#178f45] ${FOCUS}`}>
              <MessageCircle className="h-4 w-4" />{t.invite.whatsapp}
            </a>
          </div>
          <p className="mt-2.5 text-[13px] text-slate-500">{t.invite.expires(longDate(r.expiresAt, locale))}</p>
        </div>
        <button type="button" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview}
          className={`mt-3 text-sm font-semibold text-blue-600 underline underline-offset-2 ${FOCUS}`}>
          {showPreview ? t.invite.hidePreview : t.invite.preview}
        </button>
        {showPreview && (
          <div className="mt-2.5 rounded-xl bg-slate-100 p-3.5">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-slate-500">{t.invite.previewTitle}</p>
            <JoinCardPreview companyName={company.name} logo={company.logo} ownerName={ownerName} role={r.role} email={r.email} name={r.name} expires={longDate(r.expiresAt, locale)} />
          </div>
        )}
        <div className="mt-4 flex justify-end"><button type="button" className={BTN_PRIMARY} onClick={onClose}>{t.invite.done}</button></div>
      </div>
    );
  }

  return (
    <form className="grid gap-3 overflow-y-auto px-4 pb-4" onSubmit={(e) => {
      e.preventDefault();
      if (!email.trim() || blocked) return;
      invite.mutate({ email: email.trim(), role, name: name.trim() || undefined });
    }}>
      <FormField label={t.invite.name} hint={t.invite.nameHint} htmlFor="tm-name">
        <input id="tm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.invite.namePh} maxLength={255} autoComplete="off" className={INPUT} />
      </FormField>
      <FormField label={t.invite.email} hint={t.invite.emailHint} htmlFor="tm-email">
        <input id="tm-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.invite.emailPh} maxLength={320} autoComplete="off" className={INPUT} />
      </FormField>
      <FormField label={t.invite.role} htmlFor="tm-role" hint={blocked ? <span className="font-medium text-amber-700">{role === "staff" ? t.seatsFull : t.accountantNote}</span> : t.roles[role].text}>
        <select id="tm-role" value={role} onChange={(e) => setRole(e.target.value as TeamRole)} className={INPUT}>
          <option value="staff">{t.roles.staff.name}</option>
          <option value="accountant">{t.roles.accountant.name}</option>
        </select>
      </FormField>
      <button type="submit" disabled={invite.isPending || !email.trim() || blocked} className={cn(BTN_PRIMARY, "mt-1")}>
        {invite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{invite.isPending ? t.invite.creating : t.invite.button}
      </button>
      <p className="text-[13px] text-slate-500">{t.invite.note}</p>
    </form>
  );
}

// ── "Ver lo que vive el invitado": the steps, drawn with the real pieces ──

export function TourDialog({ open, onClose, company, ownerName }: { open: boolean; onClose: () => void; company: Company; ownerName: string | null }) {
  const t = useCopy(teamCopy);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${DIALOG} sm:max-w-[760px]`}>
        <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left">
          <DialogTitle className="text-[17px] font-[750] text-slate-900">{t.tour.title}</DialogTitle>
          <DialogDescription className="sr-only">{t.tour.steps.map((s) => s[1]).join(". ")}</DialogDescription>
        </DialogHeader>
        {open && <TourBody company={company} ownerName={ownerName} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function TourBody({ company, ownerName, onClose }: { company: Company; ownerName: string | null; onClose: () => void }) {
  const t = useCopy(teamCopy);
  const [step, setStep] = useState(0);
  const steps = t.tour.steps;
  const [, heading, text] = steps[step];
  const message = t.invite.message(t.tour.sampleLink, null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-slate-200 px-4">
        <div role="tablist" aria-label={t.tour.stepsLabel} className="flex gap-6 overflow-x-auto [scrollbar-width:none]">
          {steps.map((s, i) => (
            <button key={s[0]} role="tab" type="button" aria-selected={i === step} onClick={() => setStep(i)}
              className={cn("relative inline-flex shrink-0 items-center gap-1.5 pb-3 pt-2.5 text-sm font-semibold transition", FOCUS, i === step ? "text-slate-900" : "text-slate-500 hover:text-slate-900")}>
              <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold", i === step ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")}>{i + 1}</span>{s[0]}
              {i === step && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-blue-600" aria-hidden />}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        <h4 className="text-[15px] font-bold text-slate-900">{step + 1}. {heading}</h4>
        <p className="mt-0.5 text-sm text-slate-500">{text}</p>
        <div className="mt-3 rounded-xl bg-slate-100 p-3.5 sm:p-5">
          {step === 0 && (
            <div inert className="mx-auto max-w-[420px] select-none">
              <p className="mb-2 text-center text-[11px] font-semibold text-slate-500">{t.tour.chatToday}</p>
              <div className="ml-auto max-w-[85%] rounded-[14px] rounded-br-[4px] bg-[#d9fdd3] px-3.5 py-2.5 text-sm text-slate-900 shadow-sm">
                {message.split(t.tour.sampleLink)[0]}<span className="break-all text-blue-700 underline">{t.tour.sampleLink}</span>
              </div>
              <p className="mt-1 text-right text-[11px] text-slate-500">{t.tour.chatYou}</p>
            </div>
          )}
          {step === 1 && <JoinCardPreview companyName={company.name} logo={company.logo} ownerName={ownerName} role="staff" email={t.tour.sampleEmail} name={null} expires={null} />}
          {step === 2 && <RolePreview role="staff" name={null} companyName={company.name} logo={company.logo} />}
          {step === 3 && <RolePreview role="accountant" name={null} companyName={company.name} logo={company.logo} />}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
        <span className="text-[13px] text-slate-500">{t.tour.stepOf(step + 1, steps.length)}</span>
        <div className="flex gap-2">
          {step > 0 && <button type="button" className={BTN} onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" />{t.tour.prev}</button>}
          {step < steps.length - 1
            ? <button type="button" className={BTN_PRIMARY} onClick={() => setStep(step + 1)}>{t.tour.next}</button>
            : <button type="button" className={BTN_PRIMARY} onClick={onClose}>{t.tour.done}</button>}
        </div>
      </div>
    </div>
  );
}

// ── "Ver la app como …": the role's menu and home; and, once the shell supports it, the whole app that way ──

export function ViewAsDialog({ target, onClose, company, canEnter, onEnter }: {
  target: { role: TeamRole; name: string | null } | null; onClose: () => void; company: Company; canEnter: boolean; onEnter: () => void;
}) {
  const t = useCopy(teamCopy);
  const who = target ? target.name || t.roles[target.role].name : "";
  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${DIALOG} sm:max-w-[760px]`}>
        <DialogHeader className="px-4 pb-1 pt-4 pr-12 text-left">
          <DialogTitle className="text-[17px] font-[750] text-slate-900">{t.preview.dialogTitle(who)}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">{t.preview.enterNote}</DialogDescription>
        </DialogHeader>
        {target && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="rounded-xl bg-slate-100 p-3.5 sm:p-5"><RolePreview role={target.role} name={target.name} companyName={company.name} logo={company.logo} /></div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button type="button" className={BTN} onClick={onClose}>{t.preview.close}</button>
              {canEnter && <button type="button" className={BTN_PRIMARY} onClick={onEnter}>{t.preview.enter}</button>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

