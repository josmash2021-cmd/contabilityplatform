import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Check, Link2, Loader2, MoreHorizontal, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { BankLogo } from "@/components/brand/BankLogo";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { useInstitutionOf } from "@/components/brand/useInstitutionOf";
import { SplitEditor } from "./SplitEditor";
import { categoryLabel, dayLabel, money } from "./shared";
import { matchLabel, rowAccount, suggestionLabel, type ReviewItemView } from "./reviewText";

export type RowHandlers = {
  onFocus: () => void;
  onSelect: (checked: boolean) => void;
  onApprove: () => void;
  onChange: () => void;
  onPickCategory: (category: string) => void;
  onMoreCategories: () => void;
  onLink: () => void;
  onNotThis: () => void;
  onAnswer: (choice: "business" | "personal") => void;
  onSplit: () => void;
  onSaveSplit: (parts: Array<{ category: string; amount: number }>) => void;
  onExclude: () => void;
  onExcludeDuplicate: () => void;
  onOptions: () => void;
  onRuleYes: () => void;
  onRuleNo: () => void;
  /** Swipe right (phone): the row's main action. */
  onPrimary: () => void;
  /** Swipe left (phone): more options. */
  onSwipeLeft: () => void;
};

type Props = {
  item: ReviewItemView;
  /** Name shown in bold (transfers and cash deposits say what they are). */
  who: string;
  /** The category the row suggests now (the owner may have picked another one). */
  category: string;
  why: string;
  /** The owner picked the category: "Revisa"/"Seguro" becomes "Seguro". */
  changed: boolean;
  focused: boolean;
  selected: boolean;
  canReview: boolean;
  optionsOpen: boolean;
  picking: boolean;
  splitOpen: boolean;
  rulePrompt: boolean;
  topCategories: string[];
  busy: boolean;
  splitSaving: boolean;
  handlers: RowHandlers;
};

const btn = "inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border px-[11px] py-1.5 text-[13px] font-semibold transition active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[34px]";
const btnPlain = cn(btn, "border-slate-200 bg-white text-slate-900 hover:bg-slate-100");
const btnPrimary = cn(btn, "border-blue-600 bg-blue-600 text-white hover:brightness-110");
const btnGood = cn(btn, "border-transparent bg-emerald-50 text-emerald-600 hover:bg-emerald-100");
const chip = "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[13px] font-semibold";

/** One movement in Por revisar, like the prototype's .mv.rv row: checkbox, name and amount, bank line, suggestion, why, actions. */
export function ReviewRow(p: Props) {
  const t = useCopy(movimientosCopy);
  const r = t.rv;
  const locale = intlLocale(useLang().lang);
  const { item, handlers: h } = p;
  // The bank this movement went through (its original logo next to the account).
  const bank = useInstitutionOf(item.bankAccountId !== null)(item.bankAccountId);
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; active: boolean; id: number } | null>(null);
  const isMatch = item.kind === "match";
  const selectable = p.canReview && !isMatch;
  const income = item.type === "income";

  // ── Swipe (phone): → main action, ← more options. Direct DOM styling while dragging, no re-render. ──
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!p.canReview || e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("button, input, select, a, label, textarea")) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, active: false, id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = rowRef.current;
    if (!d || !el || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) { d.active = true; el.setPointerCapture(e.pointerId); el.dataset.dragging = "true"; }
      else if (Math.abs(dy) > 12) { drag.current = null; return; } else return;
    }
    d.dx = dx;
    el.style.transform = `translateX(${Math.max(-140, Math.min(140, dx))}px)`;
    el.dataset.swipe = dx > 50 ? "right" : dx < -50 ? "left" : "";
  };
  const endDrag = () => {
    const d = drag.current;
    const el = rowRef.current;
    drag.current = null;
    if (!d || !d.active || !el) return;
    el.style.transform = "";
    delete el.dataset.dragging;
    el.dataset.swipe = "";
    if (d.dx > 90) h.onPrimary();
    else if (d.dx < -90) h.onSwipeLeft();
  };

  let suggestion: ReactNode;
  if (isMatch && item.match) suggestion = <span className={cn(chip, "border-transparent bg-blue-50 text-blue-600")}><Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{matchLabel(item.match, t, locale)}</span></span>;
  else if (item.ask === "bizpersonal" && !p.changed) suggestion = <span className={cn(chip, "border-slate-200 bg-slate-100 text-slate-900")}>{r.askBizPersonal}</span>;
  else if (item.ask === "split" && !p.changed) suggestion = <span className={cn(chip, "border-slate-200 bg-slate-100 text-slate-900")}>{r.askSplit}</span>;
  else if (item.ask === "duplicate" && !p.changed) suggestion = <span className={cn(chip, "border-slate-200 bg-slate-100 text-slate-900")}>{r.askDuplicate}</span>;
  else {
    const sure = p.changed || item.conf === "high";
    suggestion = (
      <>
        <span className={cn(chip, "border-slate-200 bg-slate-100 text-slate-900")}><Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{suggestionLabel(item, p.category, t)}</span></span>
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", sure ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700")}>{sure ? r.sure : r.check}</span>
      </>
    );
  }

  let actions: ReactNode = null;
  if (p.canReview) {
    const spin = p.busy ? <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden /> : null;
    if (isMatch) {
      actions = (<>
        <button type="button" className={btnPrimary} onClick={h.onLink} disabled={p.busy}>{spin ?? <Link2 className="h-[15px] w-[15px]" aria-hidden />}{r.link}</button>
        <button type="button" className={btnPlain} onClick={h.onNotThis} disabled={p.busy}>{r.notThis}</button>
      </>);
    } else if (item.ask === "bizpersonal" && !p.changed) {
      actions = (<>
        <button type="button" className={btnPlain} onClick={() => h.onAnswer("business")} disabled={p.busy}>{r.business}</button>
        <button type="button" className={btnPlain} onClick={() => h.onAnswer("personal")} disabled={p.busy}>{r.personal}</button>
      </>);
    } else if (item.ask === "split" && !p.changed) {
      actions = (<>
        <button type="button" className={btnPrimary} onClick={h.onSplit} aria-expanded={p.splitOpen}>{r.split}</button>
        <button type="button" className={btnPlain} onClick={() => h.onAnswer("business")} disabled={p.busy}>{r.allBusiness}</button>
        <button type="button" className={btnPlain} onClick={() => h.onAnswer("personal")} disabled={p.busy}>{r.allPersonal}</button>
      </>);
    } else if (item.ask === "duplicate" && !p.changed) {
      actions = (<>
        <button type="button" className={btnPrimary} onClick={h.onExcludeDuplicate} disabled={p.busy}>{spin}{r.excludeDup}</button>
        <button type="button" className={btnPlain} onClick={h.onApprove} disabled={p.busy}>{r.notDup}</button>
      </>);
    } else {
      actions = (<>
        <button type="button" className={btnGood} onClick={h.onApprove} disabled={p.busy}>{spin ?? <Check className="h-[15px] w-[15px]" aria-hidden />}{r.approve}</button>
        <button type="button" className={btnPlain} onClick={h.onChange} aria-expanded={p.picking}>{r.change}</button>
      </>);
    }
  }

  const shownCats = p.topCategories.includes(p.category) || isMatch ? p.topCategories : [p.category, ...p.topCategories].slice(0, 7);

  return (
    <div
      ref={rowRef}
      id={`mv-${item.id}`}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, select, a, label, textarea")) h.onFocus(); }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "relative grid touch-pan-y items-start gap-x-3.5 gap-y-2.5 rounded-[14px] border bg-white px-3.5 py-[13px] transition-[opacity,transform,border-color,box-shadow,background-color] duration-300",
        "data-[dragging=true]:cursor-grabbing data-[dragging=true]:select-none data-[dragging=true]:transition-none",
        "data-[swipe=right]:border-emerald-600 data-[swipe=right]:bg-emerald-50 data-[swipe=left]:border-slate-500 data-[swipe=left]:bg-slate-100",
        selectable ? "grid-cols-[22px_minmax(0,1fr)]" : "grid-cols-1",
        p.focused ? "border-blue-600 shadow-[0_0_0_3px_theme(colors.blue.50)]" : "border-slate-200",
      )}
    >
      {selectable && (
        <input type="checkbox" checked={p.selected} onChange={(e) => h.onSelect(e.target.checked)} aria-label={r.select(p.who)}
          className="mt-0.5 h-[18px] w-[18px] cursor-pointer accent-blue-600" />
      )}
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2.5">
          <b className="flex min-w-0 items-center gap-1.5 text-sm font-[650] text-slate-900">
            {/* Only a real logo: if it can't load, nothing (no monogram), like the prototype's rows. */}
            {item.logoUrl && <MerchantLogo name={p.who} logoUrl={item.logoUrl} size={20} className="self-center" fallback={<></>} />}
            <span className="truncate">{p.who}</span>
          </b>
          <span className={cn("whitespace-nowrap text-[15px] font-[750] tabular-nums", income ? "text-emerald-600" : "text-slate-900")}>
            {income ? "+" : "−"}{money(item.amount)}
          </span>
        </div>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {item.bankName && <BankLogo name={bank?.name ?? item.bankName} logo={bank?.logo} color={bank?.color} size={18} className="mr-1.5 inline-block rounded-full align-[-4px]" />}
          {[rowAccount(item, t), dayLabel(item.date, locale)].filter(Boolean).join(" · ")} · <span title={r.asTheBankShows}>“{item.description}”</span>
        </span>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{suggestion}</div>
        <span className="mt-1 block text-xs text-slate-500">{p.why}</span>
        {(actions || p.canReview) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 [&>button]:flex-1 sm:[&>button]:flex-none">
            {actions}
            {p.canReview && (
              <button type="button" className={cn(btnPlain, "!flex-none px-[9px]")} onClick={h.onOptions} aria-label={r.more} title={r.more} aria-expanded={p.optionsOpen}>
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        )}
        {p.optionsOpen && p.canReview && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-200 pt-2.5">
            {!isMatch && !item.ask && <button type="button" className={btnPlain} onClick={h.onSplit}>{r.split}</button>}
            {!isMatch && item.ask !== null && item.ask !== "split" && <button type="button" className={btnPlain} onClick={h.onChange}>{r.change}</button>}
            <button type="button" className={btnPlain} onClick={h.onExclude}>{r.exclude}</button>
          </div>
        )}
        {p.picking && p.canReview && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-200 pt-2.5">
            <span className="w-full text-xs text-slate-500">{r.topCats}</span>
            {shownCats.map((c) => (
              <button key={c} type="button" className={cn(btnPlain, c === p.category && "border-blue-600 bg-blue-50 text-blue-700")} aria-pressed={c === p.category} onClick={() => h.onPickCategory(c)}>
                {categoryLabel(c, t)}
              </button>
            ))}
            <button type="button" className={cn(btnPlain, "text-blue-700")} onClick={h.onMoreCategories}>{r.moreCats}</button>
          </div>
        )}
        {p.splitOpen && p.canReview && <SplitEditor amount={item.amount} type={item.type} category={p.category} saving={p.splitSaving} onSave={h.onSaveSplit} />}
        {p.rulePrompt && p.canReview && (() => {
          const q = r.rulePrompt(p.who, categoryLabel(p.category, t));
          return (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-200 pt-2.5 text-[13px] text-slate-900">
              <Sparkles className="h-[15px] w-[15px] shrink-0 text-blue-600" aria-hidden />
              <span className="min-w-0 flex-[1_1_200px]">{q.a}<b>{q.who}</b>{q.b}{q.cat}{q.c}</span>
              <button type="button" className={btnPrimary} onClick={h.onRuleYes}>{r.ruleYes}</button>
              <button type="button" className={btnPlain} onClick={h.onRuleNo}>{r.ruleNo}</button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
