// Shared types and helpers for Gastos (src/pages/Expenses.tsx) and its pieces.
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../api/router";
import { TaxFileError, prepareTaxUpload, type TaxUpload } from "@/lib/taxFiles";
import { makeReceiptThumb } from "@/components/receipts/receiptFiles";
import type { ExpensesCopy } from "@/i18n/copy/expenses";

type Out = inferRouterOutputs<AppRouter>;
export type Overview = Out["expenses"]["overview"];
export type SpendRow = Overview["items"][number];
export type ReceiptUsageOut = Out["receipts"]["usage"];

/** A file picked and ready to send: the upload, its small preview, and a local URL to show it. */
export type PhotoDraft = { upload: TaxUpload; thumb: string | null; previewUrl: string | null };

/** Reads the picked file (shrinks big photos, makes the list preview). Throws TaxFileError for a wrong file. */
export async function preparePhoto(file: File): Promise<PhotoDraft> {
  const upload = await prepareTaxUpload(file);
  const thumb = await makeReceiptThumb(file, upload.mimeType);
  const isPdf = upload.mimeType === "application/pdf";
  return { upload, thumb, previewUrl: isPdf ? null : URL.createObjectURL(file) };
}

export function fileErrorText(t: ExpensesCopy, e: unknown): string {
  if (e instanceof TaxFileError) return e.reason === "tooBig" ? t.toasts.fileBig : t.toasts.fileType;
  return t.toasts.error;
}

/** The server's message (already in the person's language), unless it's a raw validation dump. */
export function serverText(t: ExpensesCopy, e: { message?: string } | null | undefined): string {
  const m = e?.message?.trim();
  return m && !m.startsWith("[") && !m.startsWith("{") ? m : t.toasts.error;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The person's local calendar day, YYYY-MM-DD. Call it outside render (a useState initializer). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-11-18" → "18 nov" (no time zone involved). */
export function shortDay(iso: string, locale: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: "numeric", month: "short" }).replace(".", "");
}

/** "noviembre" (or "noviembre 2025" when it isn't this year). */
export function monthName(year: number, month: number, locale: string, withYear = false): string {
  return new Date(year, month - 1, 1).toLocaleDateString(locale, withYear ? { month: "long", year: "numeric" } : { month: "long" });
}

export const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "25", "25.5" → what goes back in an amount box. */
export const amountText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
