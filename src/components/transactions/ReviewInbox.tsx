import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { categoriesFor } from "../../../api/lib/bankReview";
import { PERSONAL_CATEGORY, businessCategoryFor } from "../../../api/lib/reviewEngine";
import { CategoryDialog } from "./CategoryDialog";
import { ReviewRow, type RowHandlers } from "./ReviewRow";
import { categoryLabel, errorText, type MoneyType, type Movement } from "./shared";
import { whoOf, whyText, type AccountNames, type ReviewItemView } from "./reviewText";

/** What the owner picked for a row before approving it ("Cambiar"), and whether a rule came out of it. */
type Override = { category: string; type?: MoneyType; rule?: string };

export type ReviewListData = {
  total: number;
  items: ReviewItemView[];
  topCategories: { income: string[]; expense: string[] };
  accountNames: AccountNames;
};

type Props = {
  data: ReviewListData;
  /** The input review.list was called with (for updating its cache). */
  listKey: { limit: number; since: string; tzOffsetMinutes: number };
  canReview: boolean;
  /** "all" or one bank account id. */
  account: number | "all";
  tzOffsetMinutes: number;
  /** Something changed: the page refreshes its counts and the other tabs. */
  onChanged: () => void;
  onSeeDone: () => void;
  onSeeAll: () => void;
  onLoadMore: (() => void) | null;
  loadingMore: boolean;
};

const btnSm = "inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border px-[11px] py-1.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-45 sm:min-h-[34px]";

/**
 * "Pendientes": the prototype's review list. Three groups (matches, ready, needs an answer), the bulk bar,
 * J/K/A/C/X shortcuts on desktop, swipe on phone, and undo on every change.
 */
export function ReviewInbox({ data, listKey, canReview, account, tzOffsetMinutes, onChanged, onSeeDone, onSeeAll, onLoadMore, loadingMore }: Props) {
  const t = useCopy(movimientosCopy);
  const r = t.rv;
  const locale = intlLocale(useLang().lang);
  const utils = trpc.useUtils();
  const names = data.accountNames;

  const [focusId, setFocusId] = useState<number | null>(null);
  const [optsId, setOptsId] = useState<number | null>(null);
  const [pickingId, setPickingId] = useState<number | null>(null);
  const [splitId, setSplitId] = useState<number | null>(null);
  const [ruleId, setRuleId] = useState<number | null>(null);
  const [sel, setSel] = useState<ReadonlySet<number>>(() => new Set());
  const [bulkCat, setBulkCat] = useState(false);
  const [overrides, setOverrides] = useState<ReadonlyMap<number, Override>>(() => new Map());
  const [editing, setEditing] = useState<ReviewItemView | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(() => new Set());
  const [newRules, setNewRules] = useState(0);

  const visible = useMemo(() => data.items.filter((i) => account === "all" || i.bankAccountId === account), [data.items, account]);
  const isChanged = (i: ReviewItemView) => overrides.has(i.id);
  const catOf = (i: ReviewItemView) => overrides.get(i.id)?.category ?? i.category;
  const isTransfer = (i: ReviewItemView) => i.why.code === "transfer" && !isChanged(i);
  const needsAnswer = (i: ReviewItemView) => i.ask !== null && !isChanged(i);
  const groups = useMemo(() => {
    const changed = (i: ReviewItemView) => overrides.has(i.id);
    return {
      match: visible.filter((i) => i.kind === "match"),
      ready: visible.filter((i) => i.kind !== "match" && (i.kind === "ready" || changed(i))),
      ask: visible.filter((i) => i.kind === "ask" && !changed(i)),
    };
  }, [visible, overrides]);
  // The order the keyboard walks: the groups as shown.
  const ordered = useMemo(() => [...groups.match, ...groups.ready, ...groups.ask], [groups]);
  const selected = ordered.filter((i) => sel.has(i.id) && i.kind !== "match");

  // ── Mutations ──
  const approveM = trpc.review.approve.useMutation();
  const excludeM = trpc.review.exclude.useMutation();
  const linkM = trpc.review.link.useMutation();
  const dismissM = trpc.review.dismissMatch.useMutation();
  const splitM = trpc.review.split.useMutation();
  const reopenM = trpc.review.reopen.useMutation();
  const ruleM = trpc.review.rules.create.useMutation();

  const refresh = () => {
    void utils.review.list.invalidate();
    void utils.review.count.invalidate();
    void utils.review.done.invalidate();
    void utils.review.excluded.invalidate();
    onChanged();
  };

  /** Takes rows off the list right away, runs the change, and offers undo (which reopens them). */
  const resolve = async (ids: number[], run: () => Promise<unknown>, msg: string, undoable = true) => {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    const before = utils.review.list.getData(listKey);
    // Keep keyboard focus in place: the next row takes the focused one's spot.
    if (focusId !== null && unique.includes(focusId)) {
      const pos = ordered.findIndex((i) => i.id === focusId);
      const rest = ordered.filter((i) => !unique.includes(i.id));
      setFocusId(rest.length ? rest[Math.min(pos, rest.length - 1)].id : null);
    }
    setBusyIds((s) => new Set([...s, ...unique]));
    try {
      await run();
      utils.review.list.setData(listKey, (d) => d && { ...d, total: Math.max(0, d.total - unique.length), items: d.items.filter((i) => !unique.includes(i.id)) });
      utils.review.count.setData(undefined, (c) => c && { count: Math.max(0, c.count - unique.length) });
      setSel((s) => new Set([...s].filter((x) => !unique.includes(x))));
      setOverrides((m) => { const n = new Map(m); unique.forEach((x) => n.delete(x)); return n; });
      if (optsId !== null && unique.includes(optsId)) setOptsId(null);
      if (pickingId !== null && unique.includes(pickingId)) setPickingId(null);
      if (splitId !== null && unique.includes(splitId)) setSplitId(null);
      if (ruleId !== null && unique.includes(ruleId)) setRuleId(null);
      setBulkCat(false);
      toast.success(msg, undoable ? {
        duration: 6000,
        action: {
          label: r.undo,
          onClick: () => {
            reopenM.mutate({ ids: unique }, {
              onSuccess: () => { toast.success(r.tUndone); refresh(); },
              onError: (e) => toast.error(errorText(e, t.error)),
            });
          },
        },
      } : undefined);
      refresh();
    } catch (e: unknown) {
      if (before) utils.review.list.setData(listKey, before);
      toast.error(errorText(e, t.error));
    } finally {
      setBusyIds((s) => new Set([...s].filter((x) => !unique.includes(x))));
    }
  };

  const who = (i: ReviewItemView) => whoOf(i, names, t);

  const approve = (i: ReviewItemView) => {
    const o = overrides.get(i.id);
    const cat = catOf(i);
    void resolve([i.id], () => approveM.mutateAsync({ items: [{ id: i.id, category: cat, type: o?.type }], how: o ? "changed" : "approved" }), r.tApproved(who(i), categoryLabel(cat, t)));
  };
  const excludeTransfer = (i: ReviewItemView) => {
    const ids = i.transferPair && data.items.some((x) => x.id === i.transferPair) ? [i.id, i.transferPair] : [i.id];
    const pairIds = i.transferPair ? [i.id, i.transferPair] : [i.id];
    void resolve(ids, () => excludeM.mutateAsync({ ids: pairIds, reason: "transfer" }), r.tTransfer);
  };
  const excludeDuplicate = (i: ReviewItemView) =>
    void resolve([i.id], () => excludeM.mutateAsync({ ids: [i.id], reason: "duplicate", relatedId: i.duplicateOf ?? undefined }), r.tDuplicate);
  const exclude = (i: ReviewItemView) => void resolve([i.id], () => excludeM.mutateAsync({ ids: [i.id], reason: "other" }), r.tExcluded(who(i)));
  const link = (i: ReviewItemView) => {
    const m = i.match;
    if (!m) return;
    const target = m.type === "sale" ? { type: "sale" as const, saleId: m.saleId } : m.type === "bill" ? { type: "bill" as const, billId: m.billId } : { type: "cash" as const, saleIds: m.saleIds };
    const msg = m.type === "sale" ? r.tLinkedSale(m.invoiceNumber) : m.type === "bill" ? r.tLinkedBill(m.vendorName) : r.tLinkedCash;
    // A paid invoice is undone in Facturas (refund or void), not here: no undo for that one.
    void resolve([i.id], () => linkM.mutateAsync({ id: i.id, target, tzOffsetMinutes }), msg, m.type !== "sale");
  };
  const notThis = (i: ReviewItemView) => {
    const m = i.match;
    if (!m) return;
    const target = m.type === "sale" ? { type: "sale" as const, saleId: m.saleId } : m.type === "bill" ? { type: "bill" as const, billId: m.billId } : { type: "cash" as const, saleIds: m.saleIds };
    dismissM.mutate({ id: i.id, target }, {
      onSuccess: () => { toast.success(r.tNotThis); void utils.review.list.invalidate(); },
      onError: (e) => toast.error(errorText(e, t.error)),
    });
  };
  const answer = (i: ReviewItemView, choice: "business" | "personal") => {
    const cat = choice === "personal" ? PERSONAL_CATEGORY : businessCategoryFor(catOf(i));
    const fits = categoriesFor(i.type).includes(cat) ? cat : i.type === "expense" && choice === "business" ? "business_expense" : cat;
    void resolve([i.id], () => approveM.mutateAsync({ items: [{ id: i.id, category: fits }], how: "answered" }), choice === "personal" ? r.tPersonal(who(i)) : r.tBusiness(who(i)));
  };
  const saveSplit = (i: ReviewItemView, parts: Array<{ category: string; amount: number }>) => {
    const used = parts.filter((p) => p.amount > 0);
    void resolve([i.id], () => splitM.mutateAsync({ id: i.id, parts: used }), r.tSplit(who(i), used.length));
  };

  /** The row's main action: A, swipe right. */
  const primary = (i: ReviewItemView | undefined) => {
    if (!i || !canReview) return;
    if (i.kind === "match") return link(i);
    if (isTransfer(i)) return excludeTransfer(i);
    if (needsAnswer(i) && i.ask === "bizpersonal") { toast.message(r.tChooseBp(who(i))); return; }
    if (needsAnswer(i) && i.ask === "split") { setSplitId(i.id); setOptsId(null); setFocusId(i.id); return; }
    if (needsAnswer(i) && i.ask === "duplicate") return excludeDuplicate(i);
    approve(i);
  };

  const pickCategory = (i: ReviewItemView, category: string, type?: MoneyType) => {
    setOverrides((m) => new Map(m).set(i.id, { category, type }));
    setPickingId(null);
    setRuleId(i.hasRule ? null : i.id);
  };

  const createRule = (i: ReviewItemView) => {
    const cat = catOf(i);
    const pattern = i.rulePattern;
    ruleM.mutate({ pattern, category: cat }, {
      onSuccess: (res) => {
        setOverrides((m) => new Map(m).set(i.id, { ...(m.get(i.id) ?? { category: cat }), rule: res.pattern }));
        setNewRules((n) => n + 1);
        setRuleId(null);
        toast.success(r.tRule(res.pattern, categoryLabel(cat, t), res.applied));
        void utils.review.list.invalidate();
        void utils.review.rules.list.invalidate();
      },
      onError: (e) => toast.error(errorText(e, t.error)),
    });
  };

  // ── Bulk ──
  const bulkApprove = () => {
    const ok = selected.filter((i) => !needsAnswer(i) || i.ask === "duplicate");
    if (ok.length === 0) { toast.message(r.tNeedAnswer); return; }
    const transfers = ok.filter(isTransfer);
    const plain = ok.filter((i) => !isTransfer(i));
    const msg = r.tApprovedMany(ok.length) + (ok.length < selected.length ? r.tSomeNeedAnswer : "");
    void resolve([...ok.map((i) => i.id), ...transfers.map((i) => i.transferPair ?? i.id)], async () => {
      if (plain.length) await approveM.mutateAsync({ items: plain.map((i) => ({ id: i.id, category: catOf(i), type: overrides.get(i.id)?.type })), how: "approved" });
      for (const tr of transfers) await excludeM.mutateAsync({ ids: tr.transferPair ? [tr.id, tr.transferPair] : [tr.id], reason: "transfer" });
    }, msg);
  };
  const bulkSetCategory = (category: string) =>
    void resolve(selected.map((i) => i.id), () => approveM.mutateAsync({ items: selected.map((i) => ({ id: i.id, category })), how: "bulk" }), r.tBulkCat(selected.length, categoryLabel(category, t)));
  const bulkExclude = () => void resolve(selected.map((i) => i.id), () => excludeM.mutateAsync({ ids: selected.map((i) => i.id), reason: "other" }), r.tExcludedMany(selected.length));
  const approveReady = () => {
    const ready = groups.ready;
    const transfers = ready.filter(isTransfer);
    const plain = ready.filter((i) => !isTransfer(i));
    void resolve([...ready.map((i) => i.id), ...transfers.map((i) => i.transferPair ?? i.id)], async () => {
      if (plain.length) await approveM.mutateAsync({ items: plain.map((i) => ({ id: i.id, category: catOf(i), type: overrides.get(i.id)?.type })), how: "approved" });
      const seen = new Set<number>();
      for (const tr of transfers) {
        if (seen.has(tr.id)) continue;
        const ids = tr.transferPair ? [tr.id, tr.transferPair] : [tr.id];
        ids.forEach((x) => seen.add(x));
        await excludeM.mutateAsync({ ids, reason: "transfer" });
      }
    }, r.tApprovedMany(ready.length));
  };
  const selType: MoneyType | "mixed" | null = selected.length === 0 ? null : selected.every((i) => i.type === selected[0].type) ? selected[0].type : "mixed";
  const bulkCats = selType && selType !== "mixed" ? (data.topCategories[selType].length ? data.topCategories[selType] : categoriesFor(selType).slice(0, 8)) : [];

  // ── Keyboard (desktop): J/↓ next, K/↑ previous, A approve, C change, X exclude ──
  useEffect(() => {
    if (!canReview) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = (el?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || el?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (ordered.length === 0) return;
      const k = e.key.toLowerCase();
      const idx = ordered.findIndex((i) => i.id === focusId);
      const go = (n: number) => {
        e.preventDefault();
        const next = ordered[Math.max(0, Math.min(ordered.length - 1, n))];
        setFocusId(next.id);
        document.getElementById(`mv-${next.id}`)?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      };
      // Arrows only once reviewing started (a row is focused), so the page still scrolls with them.
      if (k === "j" || (k === "arrowdown" && focusId !== null)) return go(idx + 1);
      if (k === "k" || (k === "arrowup" && focusId !== null)) return go(idx < 0 ? 0 : idx - 1);
      if (idx < 0) return;
      const cur = ordered[idx];
      if (k === "a") { e.preventDefault(); primary(cur); }
      else if (k === "c" && cur.kind !== "match") { e.preventDefault(); setPickingId((p) => (p === cur.id ? null : cur.id)); setOptsId(null); }
      else if (k === "x") { e.preventDefault(); exclude(cur); }
      else if (k === "escape") { setFocusId(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const handlersFor = (i: ReviewItemView): RowHandlers => ({
    onFocus: () => setFocusId(i.id),
    onSelect: (checked) => setSel((s) => { const n = new Set(s); if (checked) n.add(i.id); else n.delete(i.id); return n; }),
    onApprove: () => (isTransfer(i) ? excludeTransfer(i) : approve(i)),
    onChange: () => { setPickingId((p) => (p === i.id ? null : i.id)); setOptsId(null); setFocusId(i.id); },
    onPickCategory: (c) => pickCategory(i, c),
    onMoreCategories: () => setEditing(i),
    onLink: () => link(i),
    onNotThis: () => notThis(i),
    onAnswer: (choice) => answer(i, choice),
    onSplit: () => { setSplitId((s) => (s === i.id ? null : i.id)); setOptsId(null); setFocusId(i.id); },
    onSaveSplit: (parts) => saveSplit(i, parts),
    onExclude: () => exclude(i),
    onExcludeDuplicate: () => excludeDuplicate(i),
    onOptions: () => { setOptsId((o) => (o === i.id ? null : i.id)); setPickingId(null); setFocusId(i.id); },
    onRuleYes: () => createRule(i),
    onRuleNo: () => setRuleId(null),
    onPrimary: () => primary(i),
    onSwipeLeft: () => { setOptsId(i.id); setFocusId(i.id); },
  });

  const rowFor = (i: ReviewItemView) => {
    const o = overrides.get(i.id);
    const cat = catOf(i);
    const why = o ? (o.rule ? r.why.ruleNew(o.rule, categoryLabel(cat, t)) : r.why.changed) : whyText(i, t, locale, names);
    const top = data.topCategories[o?.type ?? i.type];
    return (
      <ReviewRow
        key={i.id}
        item={i}
        who={who(i)}
        category={cat}
        why={why}
        changed={!!o}
        focused={focusId === i.id}
        selected={sel.has(i.id)}
        canReview={canReview}
        optionsOpen={optsId === i.id}
        picking={pickingId === i.id}
        splitOpen={splitId === i.id}
        rulePrompt={ruleId === i.id && !!o}
        topCategories={top.length ? top : categoriesFor(o?.type ?? i.type).slice(0, 6)}
        busy={busyIds.has(i.id)}
        splitSaving={splitM.isPending && splitM.variables?.id === i.id}
        handlers={handlersFor(i)}
      />
    );
  };

  const groupTitle = (title: string, n: number, right?: ReactNode) => (
    <div className="mb-2.5 mt-[18px] flex items-center justify-between gap-2.5">
      <h3 className="text-[15px] font-bold text-slate-900">{title} ({n})</h3>
      {right}
    </div>
  );

  if (data.items.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-slate-200 px-4 py-9 text-center text-slate-500">
        <b className="mb-1 block text-base text-slate-900">{r.emptyTitle}</b>
        {newRules > 0 ? r.emptyRules(newRules) : ""}{r.emptyText}
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          <button type="button" onClick={onSeeDone} className={cn(btnSm, "border-slate-200 bg-white text-slate-900 hover:bg-slate-100")}>{r.seeDone}</button>
          <button type="button" onClick={onSeeAll} className={cn(btnSm, "border-slate-200 bg-white text-slate-900 hover:bg-slate-100")}>{r.seeAll}</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {!canReview && <p className="mt-3.5 rounded-[10px] bg-blue-50 px-3 py-2.5 text-[13px] text-slate-700">{r.readOnly}</p>}

      {canReview && selected.length > 0 && (
        <div className="sticky top-2 z-10 mt-3.5">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-900 px-2.5 py-2 text-white shadow-lg">
            <b className="mr-auto pl-1 text-[13px]" aria-live="polite">{r.bulkSelected(selected.length)}</b>
            {([["approve", r.bulkApprove, bulkApprove], ["cat", r.bulkCat, () => setBulkCat((b) => !b)], ["exclude", r.bulkExclude, bulkExclude], ["clear", r.bulkCancel, () => { setSel(new Set()); setBulkCat(false); }]] as const).map(([key, label, fn]) => (
              <button key={key} type="button" onClick={fn} aria-expanded={key === "cat" ? bulkCat : undefined}
                className={cn(btnSm, "border-white/25 bg-transparent text-white hover:bg-white/10")}>{label}</button>
            ))}
          </div>
          {bulkCat && (
            <div className="mt-2 flex flex-wrap gap-1.5 rounded-xl bg-white/95 py-1 backdrop-blur">
              {selType === "mixed" ? <p className="text-[13px] text-slate-600">{r.bulkMixed}</p> : bulkCats.map((c) => (
                <button key={c} type="button" onClick={() => bulkSetCategory(c)} className={cn(btnSm, "border-slate-200 bg-white text-slate-900 hover:bg-slate-100")}>{categoryLabel(c, t)}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="animate-fade-up motion-reduce:animate-none" key={String(account)}>
        {groups.match.length > 0 && (<>
          {groupTitle(r.groupMatch, groups.match.length, <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{r.groupMatchTag}</span>)}
          <div className="grid gap-3">{groups.match.map(rowFor)}</div>
        </>)}
        {groups.ready.length > 0 && (<>
          {groupTitle(r.groupReady, groups.ready.length, canReview ? (
            <button type="button" onClick={approveReady} disabled={approveM.isPending || excludeM.isPending}
              className={cn(btnSm, "border-blue-600 bg-blue-600 text-white hover:brightness-110")}>
              {approveM.isPending ? <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden /> : <Check className="h-[15px] w-[15px]" aria-hidden />}{r.approveAll(groups.ready.length)}
            </button>
          ) : undefined)}
          <div className="grid gap-3">{groups.ready.map(rowFor)}</div>
        </>)}
        {groups.ask.length > 0 && (<>
          {groupTitle(r.groupAsk, groups.ask.length)}
          <div className="grid gap-3">{groups.ask.map(rowFor)}</div>
        </>)}
        {visible.length === 0 && <div className="mt-4 rounded-[14px] border border-dashed border-slate-200 px-4 py-9 text-center text-slate-500">{r.emptyAcct}</div>}
      </div>

      {onLoadMore && (
        <button type="button" onClick={onLoadMore} disabled={loadingMore}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60">
          {loadingMore && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{r.loadMore(data.items.length, data.total)}
        </button>
      )}

      {visible.length > 0 && canReview && (<>
        <p className="mt-4 hidden text-center text-xs text-slate-500 sm:block">
          {r.kbd.lead} <Kbd>J</Kbd> {r.kbd.or} <Kbd>↓</Kbd> {r.kbd.next} · <Kbd>A</Kbd> {r.kbd.approve} · <Kbd>C</Kbd> {r.kbd.change} · <Kbd>X</Kbd> {r.kbd.exclude}
        </p>
        <p className="mt-4 text-center text-xs text-slate-500 sm:hidden">{r.swipeHint}</p>
      </>)}

      {editing && (
        <CategoryDialog
          movement={toMovement(editing, catOf(editing), overrides.get(editing.id)?.type)}
          onClose={() => setEditing(null)}
          onPick={(picked) => pickCategory(editing, picked.category, picked.type)}
        />
      )}
    </div>
  );
}

function toMovement(i: ReviewItemView, category: string, type?: MoneyType): Movement {
  return { id: i.id, description: i.description, amount: i.amount, type: type ?? i.type, category, date: i.date, plaidAmount: i.plaidAmount, importedFrom: i.importedFrom };
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[5px] border border-b-2 border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold leading-none text-slate-900">{children}</kbd>;
}
