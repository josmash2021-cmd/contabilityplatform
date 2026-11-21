import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { useCopy } from "@/i18n/useI18n";
import { movimientosCopy } from "@/i18n/copy/movimientos";
import { REVIEW_CATEGORIES } from "../../../api/lib/bankReview";
import { RULE_PATTERN_MAX, RULE_PATTERN_MIN } from "../../../api/lib/reviewEngine";
import { categoryLabel, errorText } from "./shared";

type Draft = { id: number | null; pattern: string; category: string };

/** "Reglas": the owner's "Siempre que diga X → categoría Y" rules, to list, add, edit and remove. */
export function RulesPanel({ open, onOpenChange, canEdit, onChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canEdit: boolean;
  /** A rule was saved or removed: the list of movements may have new suggestions. */
  onChanged: () => void;
}) {
  const t = useCopy(movimientosCopy);
  const r = t.rv;
  const uid = useId();
  const utils = trpc.useUtils();
  const list = trpc.review.rules.list.useQuery(undefined, { enabled: open });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [missing, setMissing] = useState(false);

  const done = () => { void utils.review.rules.list.invalidate(); onChanged(); };
  const create = trpc.review.rules.create.useMutation({
    onSuccess: (d) => { toast.success(r.ruleSaved(d.applied)); setDraft(null); done(); },
    onError: (e) => toast.error(errorText(e, t.error)),
  });
  const update = trpc.review.rules.update.useMutation({
    onSuccess: (d) => { toast.success(r.ruleSaved(d.applied)); setDraft(null); done(); },
    onError: (e) => toast.error(errorText(e, t.error)),
  });
  const remove = trpc.review.rules.delete.useMutation({
    onSuccess: (_d, v) => { const rule = list.data?.find((x) => x.id === v.id); toast.success(r.ruleRemoved(rule?.pattern ?? "")); done(); },
    onError: (e) => toast.error(errorText(e, t.error)),
  });
  const saving = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const pattern = draft.pattern.trim();
    if (pattern.length < RULE_PATTERN_MIN || !draft.category) { setMissing(true); return; }
    if (draft.id) update.mutate({ id: draft.id, pattern, category: draft.category });
    else create.mutate({ pattern, category: draft.category });
  };

  const groups: Array<["in" | "out" | "both", string]> = [["out", r.ruleGroups.out], ["in", r.ruleGroups.in], ["both", r.ruleGroups.both]];
  const control = "h-11 w-full rounded-[10px] border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10";
  const btn = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setDraft(null); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-white p-0 sm:max-w-md">
        <SheetHeader className="border-b border-slate-100 p-5 pr-12 text-left">
          <SheetTitle className="text-lg font-bold tracking-tight text-slate-900">{r.rulesTitle}</SheetTitle>
          <SheetDescription className="text-[13px] text-slate-500">{r.rulesIntro}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-5">
          {list.isLoading ? (
            <div className="space-y-2" aria-busy="true">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : list.isError ? (
            <p className="text-sm text-slate-700">{t.error}</p>
          ) : (list.data ?? []).length === 0 ? (
            <div className="rounded-[14px] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{r.rulesEmpty}</div>
          ) : (
            <ul className="grid gap-2">
              {(list.data ?? []).map((rule) => (
                <li key={rule.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5">
                  <MerchantLogo name={rule.pattern} size={30} fallback={<span className="grid h-[30px] w-[30px] place-items-center text-blue-600"><Sparkles className="h-[18px] w-[18px]" aria-hidden /></span>} />
                  <div className="min-w-0">
                    <b className="block truncate text-sm font-semibold text-slate-900">{rule.pattern}</b>
                    <span className="block truncate text-xs text-slate-500">{r.ruleMeta(categoryLabel(rule.category, t))}{rule.usageCount > 0 ? r.ruleUsed(rule.usageCount) : ""}</span>
                  </div>
                  {canEdit && (
                    <span className="flex gap-1.5">
                      <button type="button" className={btn} onClick={() => { setMissing(false); setDraft({ id: rule.id, pattern: rule.pattern, category: rule.category }); }}>{r.ruleEdit}</button>
                      <button type="button" className={btn} disabled={remove.isPending && remove.variables?.id === rule.id} onClick={() => remove.mutate({ id: rule.id })}>{r.ruleRemove}</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!canEdit ? (
            <p className="text-[13px] text-slate-500">{r.readOnlyRules}</p>
          ) : draft ? (
            <form onSubmit={submit} noValidate className="grid gap-3 rounded-[14px] border border-slate-200 p-4">
              <p className="font-semibold text-slate-900">{draft.id ? r.ruleEditTitle : r.ruleNewTitle}</p>
              <div>
                <label htmlFor={`${uid}-p`} className="mb-1.5 block text-xs font-medium text-slate-600">{r.ruleWhen}</label>
                <input id={`${uid}-p`} value={draft.pattern} maxLength={RULE_PATTERN_MAX} autoComplete="off" aria-describedby={`${uid}-ph`}
                  onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} className={control} />
                <p id={`${uid}-ph`} className="mt-1 text-xs text-slate-500">{r.ruleWhenHint}</p>
              </div>
              <div>
                <label htmlFor={`${uid}-c`} className="mb-1.5 block text-xs font-medium text-slate-600">{r.ruleThen}</label>
                <select id={`${uid}-c`} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={control}>
                  <option value="">{r.rulePick}</option>
                  {groups.map(([dir, name]) => (
                    <optgroup key={dir} label={name}>
                      {REVIEW_CATEGORIES.filter((c) => c.dir === dir).map((c) => <option key={c.key} value={c.key}>{categoryLabel(c.key, t)}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              {missing && <p className="text-sm text-red-700" role="alert">{draft.pattern.trim().length < RULE_PATTERN_MIN ? r.ruleWhenHint : r.rulePick}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={saving}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 sm:h-10">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{r.ruleSave}
                </button>
                <button type="button" onClick={() => setDraft(null)} className="h-11 rounded-[10px] border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:h-10">
                  {r.ruleCancel}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => { setMissing(false); setDraft({ id: null, pattern: "", category: "" }); }} className={btn}>+ {r.ruleNewTitle}</button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
