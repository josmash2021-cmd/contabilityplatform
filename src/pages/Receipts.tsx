// ── Recibos: receipt photos for business expenses ──
// Snap or upload a receipt, fill in a short form, and it's saved (encrypted) with a
// matching business expense. Business Básico: 20 photos a month; Pro and Negocio: no cap.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, Camera, ChevronLeft, ChevronRight, FileText, ImageIcon, Loader2, Lock, Receipt as ReceiptIcon } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AnimatedPage } from "@/components/AnimatedPage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatCurrency } from "@/lib/utils";
import { TAX_ACCEPT, TaxFileError, prepareTaxUpload, type TaxUpload } from "@/lib/taxFiles";
import { useCopy, useLang } from "@/i18n/useI18n";
import { intlLocale } from "@/i18n/lang";
import { receiptsCopy, receiptCategoryLabel, type ReceiptsCopy } from "@/i18n/copy/receipts";
import { ReceiptFormDialog, type ReceiptFormValues } from "@/components/receipts/ReceiptFormDialog";
import { ReceiptViewer, type ReceiptItem } from "@/components/receipts/ReceiptViewer";
import { formatIsoDate, makeReceiptThumb } from "@/components/receipts/receiptFiles";
import {
  FIRST_RECEIPT_YEAR, compareMonths, isoDateOf, monthRange, shiftMonth, type ReceiptTotals, type ReceiptUsage, type YearMonth,
} from "../../api/lib/receipts";

/** A file picked and ready to send, waiting for the form. */
type Draft = { upload: TaxUpload; thumb: string | null; previewUrl: string | null };

const FIRST_MONTH: YearMonth = { year: FIRST_RECEIPT_YEAR, month: 1 };

function fileErrorText(t: ReceiptsCopy, e: unknown): string {
  if (e instanceof TaxFileError) return e.reason === "tooBig" ? t.fileErrors.tooBig : t.fileErrors.type;
  return t.toasts.error;
}

/** The server's message, unless it's a raw validation dump (the form checks first, so that's rare). */
function serverText(t: ReceiptsCopy, e: { message: string }): string {
  const m = e.message?.trim();
  return m && !m.startsWith("[") && !m.startsWith("{") ? m : t.toasts.error;
}

function monthOf(isoDate: string): YearMonth {
  const [year, month] = isoDate.split("-").map(Number);
  return { year, month };
}

function monthLabel(m: YearMonth, locale: string): string {
  const s = new Date(m.year, m.month - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Receipts() {
  const t = useCopy(receiptsCopy);
  const { lang } = useLang();
  const locale = intlLocale(lang);
  const utils = trpc.useUtils();
  const [today] = useState(() => {
    const d = new Date();
    return { iso: isoDateOf(d), month: { year: d.getFullYear(), month: d.getMonth() + 1 } as YearMonth };
  });
  const [selected, setSelected] = useState<YearMonth>(today.month);
  const isCurrentMonth = compareMonths(selected, today.month) === 0;

  const fileRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<ReceiptItem | null>(null);
  const [editing, setEditing] = useState<ReceiptItem | null>(null);

  // The photo preview lives only while the form is open.
  const previewUrl = draft?.previewUrl ?? null;
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const usage = trpc.receipts.usage.useQuery(undefined, {
    staleTime: 60_000,
    retry: (count, err) => err.data?.code !== "FORBIDDEN" && count < 1,
  });
  const usageLocked = usage.error?.data?.code === "FORBIDDEN";
  const list = trpc.receipts.list.useQuery(selected, {
    enabled: !usageLocked,
    placeholderData: keepPreviousData,
    retry: (count, err) => err.data?.code !== "FORBIDDEN" && count < 1,
  });
  const locked = usageLocked || list.error?.data?.code === "FORBIDDEN";
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const wantsThumbs = items.some((i) => i.hasThumb);
  const thumbs = trpc.receipts.thumbs.useQuery(selected, {
    enabled: !locked && wantsThumbs,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const thumbById = useMemo(
    () => new Map((thumbs.data ?? []).map((x) => [x.id, `data:image/jpeg;base64,${x.dataBase64}`])),
    [thumbs.data],
  );

  const refresh = () => Promise.all([
    utils.receipts.usage.invalidate(),
    utils.receipts.list.invalidate(),
    utils.receipts.thumbs.invalidate(),
  ]);

  const create = trpc.receipts.create.useMutation({
    onSuccess: (_res, vars) => {
      toast.success(t.toasts.saved);
      setDraft(null);
      setSelected(monthOf(vars.date)); // show it where it landed
      void refresh();
    },
    onError: (e) => {
      toast.error(serverText(t, e));
      void utils.receipts.usage.invalidate();
    },
  });
  const update = trpc.receipts.update.useMutation({
    onSuccess: (_res, vars) => {
      toast.success(t.toasts.updated);
      setEditing(null);
      setSelected(monthOf(vars.date));
      void refresh();
    },
    onError: (e) => toast.error(serverText(t, e)),
  });
  const remove = trpc.receipts.remove.useMutation({
    onSuccess: () => {
      toast.success(t.toasts.deleted);
      setViewing(null);
      void refresh();
    },
    onError: (e) => toast.error(serverText(t, e)),
  });

  const pick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ""; // the same file can be picked again
    if (!file) return;
    setPreparing(true);
    try {
      const upload = await prepareTaxUpload(file);
      const thumb = await makeReceiptThumb(file, upload.mimeType);
      const isPdf = upload.mimeType === "application/pdf";
      setDraft({ upload, thumb, previewUrl: isPdf ? null : URL.createObjectURL(file) });
    } catch (e) {
      toast.error(fileErrorText(t, e));
    } finally {
      setPreparing(false);
    }
  };

  const saveNew = (v: ReceiptFormValues) => {
    if (!draft) return;
    create.mutate({ ...v, notes: v.notes || undefined, file: { ...draft.upload, thumbBase64: draft.thumb ?? undefined } });
  };

  if (locked) {
    return (
      <AnimatedPage className="p-4 lg:p-6">
        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-neutral-100"><Lock className="h-5 w-5 text-neutral-500" aria-hidden="true" /></span>
          <h1 className="mt-4 text-lg font-semibold text-black">{t.locked.title}</h1>
          <p className="mt-2 text-sm text-neutral-600">{t.locked.text}</p>
          <Button asChild className="mt-5 w-full bg-black text-white hover:bg-neutral-800">
            <Link to="/settings">{t.locked.cta}</Link>
          </Button>
        </div>
      </AnimatedPage>
    );
  }

  const u = usage.data;
  const blocked = u ? !u.canUpload : false;
  const renewsOn = formatIsoDate(monthRange(today.month.year, today.month.month).end, locale, { day: "numeric", month: "long" });

  return (
    <AnimatedPage className="p-4 lg:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="min-w-0">
          <h1 className="text-lg font-semibold text-black">{t.title}</h1>
          <p className="text-xs text-neutral-500">{t.subtitle}</p>
        </header>

        {/* Upload */}
        <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
          <CardContent className="space-y-3 p-4">
            <input
              ref={fileRef}
              type="file"
              name="receipt-file"
              accept={TAX_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            <Button
              className="h-14 w-full bg-black text-base text-white hover:bg-neutral-800"
              disabled={preparing || blocked}
              onClick={() => fileRef.current?.click()}
            >
              {preparing ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Camera className="size-5" aria-hidden="true" />}
              <span className="truncate">{preparing ? t.upload.preparing : blocked ? t.upload.blocked : t.upload.cta}</span>
            </Button>
            <p className="text-center text-[11px] text-neutral-500">{t.upload.hint}</p>
            {u && u.cap !== null && <UsageMeter t={t} usage={u} cap={u.cap} renewsOn={renewsOn} />}
          </CardContent>
        </Card>

        {/* Month */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-black">{t.list.title}</h2>
          <div className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label={t.month.label}>
            <Button
              variant="outline" size="icon" className="h-9 w-9 shrink-0 border-neutral-200"
              aria-label={t.month.prev} disabled={compareMonths(selected, FIRST_MONTH) <= 0}
              onClick={() => setSelected(shiftMonth(selected, -1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-[8.5rem] text-center text-sm font-medium text-black" aria-live="polite">{monthLabel(selected, locale)}</p>
            <Button
              variant="outline" size="icon" className="h-9 w-9 shrink-0 border-neutral-200"
              aria-label={t.month.next} disabled={isCurrentMonth}
              onClick={() => setSelected(shiftMonth(selected, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isCurrentMonth && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-neutral-600" onClick={() => setSelected(today.month)}>{t.month.current}</Button>
            )}
          </div>
        </div>

        {list.isLoading ? (
          <div className="space-y-3" role="status" aria-label={t.loading}>
            <Skeleton className="h-24 rounded-xl" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
            </div>
          </div>
        ) : list.isError || !list.data ? (
          <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-neutral-600" role="alert">{t.error}</p>
              <Button variant="outline" size="sm" onClick={() => void list.refetch()}>{t.retry}</Button>
            </CardContent>
          </Card>
        ) : (
          <div className={cn("grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start", list.isPlaceholderData && "opacity-60 transition-opacity")} aria-busy={list.isPlaceholderData}>
            <MonthTotals t={t} totals={list.data.totals} />

            <div className="lg:order-1 lg:col-span-2">
              {items.length === 0 ? (
                <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none">
                  <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-neutral-100" aria-hidden="true"><ReceiptIcon className="h-5 w-5 text-neutral-500" /></span>
                    <p className="text-sm font-medium text-black">{t.empty.title}</p>
                    <p className="max-w-xs text-xs text-neutral-500">{t.empty.text}</p>
                  </CardContent>
                </Card>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {items.map((r) => {
                    const amount = formatCurrency(r.amount);
                    const date = formatIsoDate(r.date, locale, { day: "numeric", month: "short" });
                    const category = receiptCategoryLabel(t, r.category);
                    const thumb = thumbById.get(r.id);
                    return (
                      <li key={r.id} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setViewing(r)}
                          aria-label={t.list.open(r.merchant, amount, date, category)}
                          className="flex w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-left transition-colors hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-1"
                        >
                          <span className="grid aspect-[4/3] w-full place-items-center overflow-hidden bg-neutral-100">
                            {thumb ? (
                              <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : r.mimeType === "application/pdf" ? (
                              <span className="flex flex-col items-center gap-1 text-neutral-500">
                                <FileText className="h-7 w-7" aria-hidden="true" />
                                <span className="text-[11px] font-medium">{t.list.pdf}</span>
                              </span>
                            ) : (
                              <ImageIcon className="h-7 w-7 text-neutral-400" aria-hidden="true" />
                            )}
                          </span>
                          <span className="block w-full p-2.5">
                            <span className="block truncate text-sm font-medium text-black">{r.merchant}</span>
                            <span className="block text-sm font-semibold tabular-nums text-black">{amount}</span>
                            <span className="block truncate text-[11px] text-neutral-500">{date} · {category}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {draft && (
        <ReceiptFormDialog
          mode="new"
          initial={{ date: today.iso }}
          maxDate={today.iso}
          preview={{ url: draft.previewUrl, isPdf: draft.upload.mimeType === "application/pdf", fileName: draft.upload.fileName }}
          saving={create.isPending}
          onSave={saveNew}
          onClose={() => setDraft(null)}
        />
      )}
      {editing && (
        <ReceiptFormDialog
          key={editing.id}
          mode="edit"
          initial={{
            merchant: editing.merchant, amount: editing.amount, date: editing.date, category: editing.category,
            paymentMethod: editing.paymentMethod, notes: editing.notes,
          }}
          maxDate={editing.date > today.iso ? editing.date : today.iso}
          saving={update.isPending}
          onSave={(v) => update.mutate({ id: editing.id, ...v, notes: v.notes || undefined })}
          onClose={() => setEditing(null)}
        />
      )}
      {viewing && (
        <ReceiptViewer
          key={viewing.id}
          receipt={viewing}
          deleting={remove.isPending}
          onClose={() => setViewing(null)}
          onEdit={(r) => { setViewing(null); setEditing(r); }}
          onDelete={(r) => remove.mutate({ id: r.id })}
        />
      )}
    </AnimatedPage>
  );
}

/** Básico only: how many photos are left this month, and the way out when there are none. */
function UsageMeter({ t, usage, cap, renewsOn }: { t: ReceiptsCopy; usage: ReceiptUsage; cap: number; renewsOn: string }) {
  const full = !usage.canUpload;
  const left = usage.remaining ?? 0;
  const pct = Math.min(100, Math.round((usage.used / cap) * 100));
  const usedText = t.usage.used(Math.min(usage.used, cap), cap);
  return (
    <div className={cn("rounded-lg border p-3", full ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-neutral-50")}>
      <div className="flex items-start gap-2.5">
        {full
          ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          : <Camera className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-black">{full ? t.usage.full(cap) : t.usage.left(left, cap)}</p>
          <Progress
            value={pct}
            aria-label={t.usage.progress}
            getValueLabel={() => usedText}
            className="mt-2 h-1.5 bg-neutral-200"
          />
          <p className="mt-1.5 text-xs text-neutral-600">{usedText} · {t.usage.renews(renewsOn)}</p>
          {(full || left <= 5) && (
            <p className="mt-1 text-xs text-neutral-600">
              {t.usage.upgradeHint}{" "}
              <Link to="/settings" className="font-medium text-black underline underline-offset-2 hover:text-neutral-700">{t.usage.upgrade}</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The month's total and how it splits by category (amount and share as text; the bar only repeats it). */
function MonthTotals({ t, totals }: { t: ReceiptsCopy; totals: ReceiptTotals }) {
  return (
    <Card className="gap-0 rounded-xl border-neutral-200 py-0 shadow-none lg:order-2">
      <CardContent className="p-4">
        <p className="text-xs text-neutral-500">{t.totals.title}</p>
        <p className="text-2xl font-semibold tabular-nums text-black">{formatCurrency(totals.total)}</p>
        <p className="text-xs text-neutral-500">{t.totals.count(totals.count)}</p>
        {totals.byCategory.length > 0 && (
          <>
            <h3 className="mt-4 text-xs font-medium text-neutral-500">{t.totals.byCategory}</h3>
            <ul className="mt-2 space-y-2.5">
              {totals.byCategory.map((c) => {
                const pct = totals.total > 0 ? Math.round((c.total / totals.total) * 100) : 0;
                return (
                  <li key={c.category} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-neutral-700">{receiptCategoryLabel(t, c.category)}</span>
                      <span className="shrink-0 font-medium tabular-nums text-black">{formatCurrency(c.total)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100" aria-hidden="true">
                        <div className="h-full rounded-full bg-neutral-800" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-neutral-500">{t.totals.share(pct)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
