// Calendar-day helpers for Presupuestos, Metas and Suscripciones ("2026-11-21" strings, no time zones).
import { useState } from "react";

/** Today on this device, fixed for the page's life: "2026-11-21", the day of the month and how many days it has. */
export type Today = { key: string; y: number; m: number; d: number; days: number };
export function useToday(): Today {
  const [today] = useState<Today>(() => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    return { key: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, y, m, d, days: new Date(y, m, 0).getDate() };
  });
  return today;
}

/** Whole months from today's month to a calendar day's month ("2027-06-30" in Nov 2026 → 7). */
export function monthsUntil(today: Today, day: string): number {
  const [y, m] = day.split("-").map(Number);
  return (y * 12 + m) - (today.y * 12 + today.m);
}

/** The last day of the month `n` months after today's ("2027-06-30"). */
export function monthEndAfter(today: Today, n: number): string {
  const d = new Date(Date.UTC(today.y, today.m - 1 + n + 1, 0));
  return d.toISOString().slice(0, 10);
}

/** "junio de 2027" / "June 2027" for a calendar day or a month offset from today. */
export function monthName(day: string, locale: string): string {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "1 dic" / "Dec 1" (and the year when it isn't this year's). */
export function shortDay(day: string, locale: string, thisYear: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", ...(y !== thisYear ? { year: "numeric" } : {}), timeZone: "UTC" }).replace(".", "");
}

/** Days from today to a calendar day. */
export function daysFrom(today: Today, day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.y, today.m - 1, today.d)) / 86_400_000);
}

/** A DATE column as a calendar day "2027-06-30" (it may arrive as a Date at UTC midnight or as a string). */
export function dayString(d: unknown): string {
  if (!d) return "";
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
