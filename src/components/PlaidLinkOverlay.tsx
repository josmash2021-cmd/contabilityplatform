import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router";
import { usePlaidLink, type PlaidLinkError, type PlaidLinkOnSuccessMetadata } from "react-plaid-link";
import { toast } from "sonner";
import { ArrowRight, Check, Landmark, Loader2, Lock, RefreshCw, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { BankLogo } from "@/components/brand/BankLogo";
import { SecureLine } from "@/components/bank/BankBottom";
import { localToday } from "@/components/bank/bankView";
import { useReducedMotion } from "@/hooks/useInView";
import { useCopy } from "@/i18n/useI18n";
import { bankCopy } from "@/i18n/copy/bank";

interface PlaidLinkOverlayProps {
  onSuccess?: () => void;
  onClose?: () => void;
}

type Phase = "intro" | "opening" | "importing" | "done";
type Tick = "wait" | "run" | "done";
type Account = { id: string; name: string; mask: string | null; type: string | null; balance: number | null };
type Bank = { name: string; logo: string | null; color: string | null };
type Run = { linked: boolean; accounts: Account[] | null; movements: Tick; added: number; sorted: boolean; later: boolean; review: number };

const NEW_RUN: Run = { linked: false, accounts: null, movements: "wait", added: 0, sorted: false, later: false, review: 0 };
// Shown on the first screen with their original logos (bundled in public/brands/banks).
const POPULAR = ["Chase", "Bank of America", "Wells Fargo", "Regions Bank", "Capital One"];
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const btn =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-[0_10px_22px_-12px_rgba(37,99,235,0.9)] transition hover:bg-blue-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
const ghost =
  "inline-flex h-9 w-full items-center justify-center rounded-lg text-[13px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

/**
 * "Conectar tu banco": one window from start to finish.
 * 1. What will happen and why it's safe (the app's logo linked to a bank). 2. Plaid's own secure window
 * (bank, sign-in, accounts), which the app can't style. 3. The movements coming in, live. 4. "Listo": every
 * account with its bank's original logo and balance, how many movements arrived and what to review.
 * Rendered on <body> so the dark backdrop always covers the whole screen; a bottom sheet on phones.
 */
export function PlaidLinkOverlay({ onSuccess, onClose }: PlaidLinkOverlayProps) {
  const { plaid: t } = useCopy(bankCopy);
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const personal = pathname.startsWith("/personal");
  const utils = trpc.useUtils();

  const [phase, setPhase] = useState<Phase>("intro");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [bank, setBank] = useState<Bank>({ name: "", logo: null, color: null });
  const [run, setRun] = useState<Run>(NEW_RUN);
  const alive = useRef(true);
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const createToken = trpc.bank.createLinkToken.useMutation();
  const exchange = trpc.bank.exchangePublicToken.useMutation();
  const syncItem = trpc.banks.syncItem.useMutation();

  const start = async () => {
    setPhase("opening");
    setLinkToken(null);
    try {
      const r = await createToken.mutateAsync();
      if (!alive.current) return;
      if (r?.linkToken) setLinkToken(r.linkToken);
      else { toast.error(t.startError); setPhase("intro"); }
    } catch (e: unknown) {
      if (!alive.current) return;
      toast.error(e instanceof Error && e.message ? e.message : t.startError);
      setPhase("intro");
    }
  };

  // Everything after Plaid says yes: save the bank, then bring its movements, each step shown as it happens.
  const bringIn = async (publicToken: string) => {
    const pause = (ms: number) => wait(reduce ? 0 : ms);
    let r: Awaited<ReturnType<typeof exchange.mutateAsync>>;
    try {
      r = await exchange.mutateAsync({ publicToken });
    } catch (e: unknown) {
      if (!alive.current) return;
      toast.error(e instanceof Error && e.message ? e.message : t.connectError);
      setPhase("intro");
      return;
    }
    if (!alive.current) return;
    if (!r.success || !("itemId" in r)) {
      const limit = "code" in r && r.code === "bank_limit" ? r.limit : null;
      toast.error(limit !== null ? (personal ? t.bankLimitPersonal(limit) : t.bankLimit(limit)) : ("error" in r && r.error) || t.connectError);
      setPhase("intro");
      return;
    }
    const itemId = r.itemId;
    setRun((x) => ({ ...x, linked: true }));
    await pause(450);
    if (!alive.current) return;
    setRun((x) => ({ ...x, accounts: r.accounts, movements: "run" }));
    // Plaid's logo for banks the app doesn't carry (best effort).
    void utils.brand.institutions.fetch().then((list) => {
      const inst = list.find((i) => i.itemId === itemId);
      if (inst && alive.current) setBank((b) => ({ name: inst.name || b.name, logo: inst.logo, color: inst.color }));
    }).catch(() => undefined);

    let added = 0;
    let later = false;
    try {
      const s = await syncItem.mutateAsync({ itemId, today: localToday(new Date()) });
      if (s.ok) added = s.added; else later = true;
    } catch {
      later = true;
    }
    if (!alive.current) { void utils.invalidate(); return; }
    setRun((x) => ({ ...x, movements: "done", added, later }));
    await pause(1300);
    if (!alive.current) { void utils.invalidate(); return; }
    setRun((x) => ({ ...x, sorted: true }));
    let review = 0;
    if (!personal) {
      try { review = (await utils.review.count.fetch(undefined, { staleTime: 0 })).count; } catch { review = 0; }
    }
    await pause(650);
    if (!alive.current) { void utils.invalidate(); return; }
    setRun((x) => ({ ...x, review }));
    setPhase("done");
    void utils.invalidate();
  };

  const onPlaidSuccess = useCallback((publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    const name = metadata.institution?.name?.trim() || t.fallbackBank;
    setBank({ name, logo: null, color: null });
    setRun(NEW_RUN);
    setPhase("importing");
    void bringIn(publicToken);
    // bringIn reads only refs and stable mutation helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.fallbackBank]);

  const onPlaidExit = useCallback((error: PlaidLinkError | null) => {
    if (error) toast.error(t.plaidError);
    setLinkToken(null);
    setPhase((p) => (p === "opening" ? "intro" : p));
  }, [t.plaidError]);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess: onPlaidSuccess, onExit: onPlaidExit });

  // Open Plaid's window once its token is ready (once per token).
  useEffect(() => {
    if (phase === "opening" && linkToken && ready && openedFor.current !== linkToken) {
      openedFor.current = linkToken;
      open();
    }
  }, [phase, linkToken, ready, open]);

  const closable = phase !== "opening";
  const close = useCallback(() => {
    if (phase === "importing" || phase === "done") void utils.invalidate();
    onClose?.();
  }, [phase, onClose, utils]);

  // The page behind doesn't scroll, and Escape closes.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && closable) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closable, close]);

  const finish = () => {
    if (onSuccess) onSuccess(); else onClose?.();
    if (personal && pathname !== "/personal/transactions") navigate("/personal/transactions");
  };
  const toReview = () => {
    if (onSuccess) onSuccess(); else onClose?.();
    navigate("/transactions");
  };
  const another = () => {
    setRun(NEW_RUN);
    setBank({ name: "", logo: null, color: null });
    void start();
  };

  const progress = run.sorted ? 1 : run.movements === "done" ? 0.85 : run.accounts ? 0.55 : run.linked ? 0.35 : 0.15;
  const doneText = run.later ? t.doneLater(bank.name) : run.added > 0 ? t.doneText(run.added, bank.name) : t.doneNone(bank.name);

  const overlay = (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="pl-title">
      <div className="pl-veil absolute inset-0 bg-slate-950/45 backdrop-blur-[3px]" onClick={closable ? close : undefined} aria-hidden="true" />
      <div className="pl-sheet relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[26px] bg-white pb-[calc(14px+env(safe-area-inset-bottom,0px))] shadow-[0_-20px_50px_-20px_rgba(11,18,32,0.5)] sm:max-w-[420px] sm:rounded-[22px] sm:pb-0 sm:shadow-[0_40px_80px_-28px_rgba(11,18,32,0.55)]">
        <div className="mx-auto mt-2 h-[5px] w-[38px] rounded-full bg-slate-300 sm:hidden" aria-hidden="true" />
        {closable && (
          <button type="button" onClick={close} aria-label={t.close}
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        <div key={phase} className="pl-step grid gap-4 px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-7">
          {phase === "intro" && (
            <>
              <LinkArt />
              <Head title={t.title} text={t.lead} />
              <div className="flex items-center justify-center gap-2">
                <span className="flex gap-1.5">
                  {POPULAR.map((n) => <BankLogo key={n} name={n} size={28} />)}
                </span>
                <span className="text-xs text-slate-500">{t.worksWith}</span>
              </div>
              <ol className="grid grid-cols-3 gap-2">
                {t.how.map((s, i) => (
                  <li key={s} className="grid justify-items-center gap-1.5 text-center text-xs leading-snug text-slate-700">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">{i + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
              <ul className="grid gap-2 border-t border-slate-200 pt-3 text-[13px] text-slate-700">
                {t.points.map((p) => (
                  <li key={p} className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />{p}</li>
                ))}
              </ul>
              <div className="grid gap-1">
                <button type="button" className={btn} onClick={() => void start()}>{t.continue}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
                <button type="button" className={ghost} onClick={close}>{t.skip}</button>
              </div>
              <SecureLine className="justify-center text-xs" />
            </>
          )}

          {phase === "opening" && (
            <>
              <LinkArt />
              <Head title={t.opening} text={t.openingHint} />
              <Loader2 className="mx-auto h-6 w-6 text-blue-600 motion-safe:animate-spin" aria-hidden="true" />
              <SecureLine className="justify-center text-xs" />
            </>
          )}

          {phase === "importing" && (
            <>
              <Ring progress={progress} spinning={!run.sorted}>
                <BankLogo name={bank.name} logo={bank.logo} color={bank.color} size={48} />
              </Ring>
              <Head title={t.importTitle} text={t.importSub(bank.name)} />
              <ul className="grid gap-2.5 text-[13.5px]" aria-live="polite">
                <TickRow state={run.linked ? "done" : "run"}>{t.linked}</TickRow>
                <TickRow state={run.accounts ? "done" : run.linked ? "run" : "wait"}>{run.accounts ? t.accounts(run.accounts.length) : t.accountsWait}</TickRow>
                <TickRow state={run.movements}>
                  {t.received}
                  {run.movements === "done" && <span className="ml-auto text-xs font-semibold tabular-nums text-slate-500"><CountUp to={run.added} /></span>}
                </TickRow>
                <TickRow state={run.sorted ? "done" : run.movements === "done" ? "run" : "wait"}>{t.sorted}</TickRow>
              </ul>
              <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />{t.closeHint}
              </p>
            </>
          )}

          {phase === "done" && (
            <>
              <span className="pl-ok relative mx-auto mt-1 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="pl-check h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <Head title={t.doneTitle} text={doneText} />
              {!!run.accounts?.length && (
                <ul className="grid border-t border-slate-200">
                  {run.accounts.map((a, i) => (
                    <li key={a.id} className="pl-row flex items-center gap-3 border-b border-slate-200 py-2.5 text-[13.5px]" style={{ animationDelay: `${150 + i * 90}ms` }}>
                      <BankLogo name={bank.name} logo={bank.logo} color={bank.color} size={34} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{a.name}</span>
                        <span className="block text-xs text-slate-500">{[a.type === "credit" ? t.card : null, a.mask ? `•••• ${a.mask}` : null].filter(Boolean).join(" · ")}</span>
                      </span>
                      {a.balance !== null && <span className="ml-auto pl-2 font-semibold tabular-nums text-slate-900">{money.format(a.balance)}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {!personal && run.review > 0 && (
                <button type="button" onClick={toReview}
                  className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5 text-left text-[13px] font-medium text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 ring-4 ring-amber-500/15" aria-hidden="true" />
                  {t.review(run.review)}
                  <ArrowRight className="ml-auto h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              )}
              <div className="grid gap-1">
                <button type="button" className={btn} onClick={finish}>{t.see}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
                <button type="button" className={ghost} onClick={another}>{t.another}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
  return createPortal(overlay, document.body);
}

function Head({ title, text }: { title: string; text: string }) {
  return (
    <div className="grid gap-1.5 text-center">
      <h2 id="pl-title" className="text-balance text-[21px] font-bold leading-tight tracking-tight text-slate-900">{title}</h2>
      <p className="text-balance text-sm text-slate-500">{text}</p>
    </div>
  );
}

/** The app's logo linked to a bank by a moving, locked line. */
function LinkArt() {
  return (
    <div className="flex items-center justify-center gap-2.5 pt-1" aria-hidden="true">
      <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl bg-blue-600 shadow-[0_12px_24px_-12px_rgba(37,99,235,0.8)]">
        <Logo className="h-7 w-7 text-white" />
      </span>
      <span className="pl-wire relative h-0.5 w-[74px]">
        <span className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-4 ring-white">
          <Lock className="h-3.5 w-3.5" />
        </span>
      </span>
      <span className="grid h-[52px] w-[52px] place-items-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
        <Landmark className="h-6 w-6" />
      </span>
    </div>
  );
}

/** A progress ring around the bank's logo. */
function Ring({ progress, spinning, children }: { progress: number; spinning: boolean; children: ReactNode }) {
  const c = 2 * Math.PI * 40;
  return (
    <div className="relative mx-auto mt-1 grid h-[92px] w-[92px] place-items-center" aria-hidden="true">
      <svg viewBox="0 0 92 92" className={cn("absolute inset-0 h-full w-full -rotate-90", spinning && "pl-ring-spin")}>
        <circle cx="46" cy="46" r="40" fill="none" stroke="#E8EEF8" strokeWidth="6" />
        <circle cx="46" cy="46" r="40" fill="none" stroke="#2563EB" strokeWidth="6" strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)} className="transition-[stroke-dashoffset] duration-700 ease-out" />
      </svg>
      {children}
    </div>
  );
}

function TickRow({ state, children }: { state: Tick; children: ReactNode }) {
  return (
    <li className={cn("flex items-center gap-2.5 transition-colors duration-300", state === "wait" ? "text-slate-400" : "text-slate-900")}>
      <span className={cn("grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors duration-300",
        state === "done" ? "border-emerald-600 bg-emerald-600 text-white" : state === "run" ? "border-blue-200 border-t-blue-600 motion-safe:animate-spin" : "border-slate-200")}>
        {state === "done" && <Check className="h-3 w-3" strokeWidth={3.2} aria-hidden="true" />}
      </span>
      {children}
    </li>
  );
}

/** Counts up to `to` once (shows it at once when motion is reduced). */
function CountUp({ to }: { to: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100);
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, reduce]);
  return <>{(reduce ? to : n).toLocaleString("en-US")}</>;
}
