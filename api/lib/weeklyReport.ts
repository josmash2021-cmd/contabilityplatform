// "Tu resumen del lunes" as files: last week in a PDF (to read or print) and an Excel (for the accountant),
// drawn with the same writers as Reportes' "Exportar" (src/components/reports/export), so they look the same.
import * as XLSX from "xlsx";
import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { bankAccounts, bankTransactions, companySettings } from "@db/schema";
import { layoutPdf, money, type PdfKpi, type PdfSection } from "../../src/components/reports/export/model";
import { renderPdf, type Page } from "../../src/components/reports/export/pdf";
import { writeXlsx, type CellInput, type CfbLike, type SheetSpec } from "../../src/components/reports/export/xlsx";
import type { weeklyOf } from "../assistant-router";
import { addDays, billsDueOf, receivablesOf, type BillDue, type Receivable } from "./assistantTools";
import { displayNameOf } from "./reviewEngine";
import { accountShortLabel } from "./banks";

type Db = ReturnType<typeof getDb>;
export type Weekly = Awaited<ReturnType<typeof weeklyOf>>;

export type WeekMove = { date: string; description: string; account: string; moneyIn: number; moneyOut: number };
export type WeeklyDetail = {
  company: string;
  companyLine: string | null;
  /** "del 10 al 16 de noviembre de 2026" */
  weekLabel: string;
  /** "17 nov 2026" */
  madeOn: string;
  w: Weekly;
  moves: WeekMove[];
  owed: Receivable[];
  bills: BillDue[];
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const part = (day: string) => ({ y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)) - 1, d: Number(day.slice(8, 10)) });

/** "del 10 al 16 de noviembre de 2026" (or "del 28 de octubre al 3 de noviembre de 2026"). */
export function weekLabel(from: string, to: string): string {
  const a = part(from), b = part(to);
  if (a.y !== b.y) return `del ${a.d} de ${MONTHS[a.m]} de ${a.y} al ${b.d} de ${MONTHS[b.m]} de ${b.y}`;
  if (a.m !== b.m) return `del ${a.d} de ${MONTHS[a.m]} al ${b.d} de ${MONTHS[b.m]} de ${b.y}`;
  return `del ${a.d} al ${b.d} de ${MONTHS[b.m]} de ${b.y}`;
}
/** "17 nov 2026" */
export const shortDay = (day: string) => { const p = part(day); return `${p.d} ${MONTHS[p.m].slice(0, 3)} ${p.y}`; };
/** "10 nov" (never 10/11, which reads as October 11 in the US). */
const dm = (day: string) => { const p = part(day); return `${p.d} ${MONTHS[p.m].slice(0, 3)}`; };
const cents = (n: number) => Math.round(n * 100);
const total = (xs: readonly number[]) => xs.reduce((s, x) => s + cents(x), 0) / 100;
const daysLate = (due: string | null, today: string) => (due && due < today ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000) : 0);

/** Everything the files need: the business's name, last week's movements, who owes and what's due this week. */
export async function weeklyDetailOf(db: Db, userId: number, w: Weekly): Promise<WeeklyDetail> {
  const [cs] = await db.select({ name: companySettings.companyName, city: companySettings.city, state: companySettings.state, phone: companySettings.phone })
    .from(companySettings).where(eq(companySettings.userId, userId)).limit(1)
    .catch(() => [] as Array<{ name: string | null; city: string | null; state: string | null; phone: string | null }>);
  const company = (cs?.name && cs.name !== "Tu Placa" ? cs.name : "") || "Tu negocio";
  const companyLine = [cs?.city, cs?.state, cs?.phone].filter(Boolean).join(" · ") || null;
  type Row = { date: string; description: string; merchantName: string | null; amount: string; type: string; bankName: string | null; accountNumber: string | null };
  const rows: Row[] = await db.select({
    date: sql<string>`DATE_FORMAT(${bankTransactions.transactionDate}, '%Y-%m-%d')`, description: bankTransactions.description,
    merchantName: bankTransactions.merchantName, amount: bankTransactions.amount, type: bankTransactions.type,
    bankName: bankAccounts.bankName, accountNumber: bankAccounts.accountNumber,
  }).from(bankTransactions).leftJoin(bankAccounts, eq(bankAccounts.id, bankTransactions.bankAccountId))
    .where(and(eq(bankTransactions.userId, userId), sql`${bankTransactions.transactionDate} >= ${w.from}`, sql`${bankTransactions.transactionDate} <= ${w.to}`))
    .orderBy(bankTransactions.transactionDate, bankTransactions.id);
  const moves: WeekMove[] = rows.map((r) => {
    const amount = Math.abs(Number(r.amount) || 0);
    return {
      date: r.date, description: displayNameOf(r.description, r.merchantName) || r.description,
      account: accountShortLabel(r.bankName, r.accountNumber) ?? "",
      moneyIn: r.type === "income" ? amount : 0, moneyOut: r.type === "income" ? 0 : amount,
    };
  });
  const business = w.mode === "business";
  return {
    company, companyLine, weekLabel: weekLabel(w.from, w.to), madeOn: shortDay(w.today), w, moves,
    owed: business ? await receivablesOf(db, userId, w.today) : [],
    bills: business ? await billsDueOf(db, userId, w.today, addDays(w.today, 6)) : [],
  };
}

/** The summary's boxes (the same numbers as the email), as amounts. */
export type WeekKpi = { label: string; amount: number; line: string; good: boolean | null; accent: boolean };
export function weekKpis(d: WeeklyDetail): WeekKpi[] {
  const w = d.w;
  const ins = d.moves.filter((m) => m.moneyIn).length, outs = d.moves.filter((m) => m.moneyOut).length;
  const base: WeekKpi[] = [
    { label: "Entró", amount: total(d.moves.map((m) => m.moneyIn)), line: `${ins} ${ins === 1 ? "entrada" : "entradas"}`, good: null, accent: false },
    { label: w.mode === "personal" ? "Gastaste" : "Salió", amount: total(d.moves.map((m) => m.moneyOut)), line: `${outs} ${outs === 1 ? "salida" : "salidas"}`, good: null, accent: false },
  ];
  if (w.mode === "personal") {
    return [...base, { label: "Ahorrado en metas", amount: w.goals.saved, line: w.goals.count ? `de ${money(w.goals.target)}` : "Sin metas todavía", good: null, accent: true }];
  }
  const late = d.owed.filter((o) => o.late).length;
  return [
    ...base,
    { label: "Te deben", amount: total(d.owed.map((o) => o.balance)), line: late ? `${late} ${late === 1 ? "factura vencida" : "facturas vencidas"}` : "Nada vencido", good: late ? false : true, accent: true },
    { label: "Pagas esta semana", amount: total(d.bills.map((b) => b.amount)), line: `${d.bills.length} ${d.bills.length === 1 ? "factura" : "facturas"}`, good: null, accent: false },
  ];
}
const kpis = (d: WeeklyDetail): PdfKpi[] => weekKpis(d).map((k) => ({ label: k.label, value: money(k.amount), line: k.line, good: k.good, accent: k.accent }));

/** The PDF's pages: the business's header, the KPI boxes and the week's tables (letter size, as many as needed). */
export function weeklyPages(d: WeeklyDetail): Page[] {
  const sections: PdfSection[] = [{
    kind: "table", title: "Movimientos de la semana", sub: `Tus bancos ${d.weekLabel}`,
    cols: [{ h: "Fecha", w: 0.1 }, { h: "Descripción", w: 0.4 }, { h: "Cuenta", w: 0.26 }, { h: "Entró", w: 0.12, right: true }, { h: "Salió", w: 0.12, right: true }],
    rows: [
      ...d.moves.map((m) => ({ c: [dm(m.date), m.description, m.account, m.moneyIn ? money(m.moneyIn) : "", m.moneyOut ? money(m.moneyOut) : ""] })),
      ...(d.moves.length ? [{ c: ["", "Total", "", money(total(d.moves.map((m) => m.moneyIn))), money(total(d.moves.map((m) => m.moneyOut)))], total: true }] : []),
    ],
    empty: "No hubo movimientos en tus bancos esa semana.",
  }];
  if (d.w.mode === "business") {
    sections.push({
      kind: "table", title: "Te deben", sub: "Facturas enviadas que no se han pagado",
      cols: [{ h: "Cliente", w: 0.46 }, { h: "Vence", w: 0.18 }, { h: "Atraso", w: 0.16 }, { h: "Saldo", w: 0.2, right: true }],
      rows: [
        ...d.owed.map((o) => { const late = daysLate(o.dueDate, d.w.today); return { c: [o.client || "Cliente", o.dueDate ? dm(o.dueDate) : "—", late ? `${late} días` : "Al día", money(o.balance)], ...(late ? { red: 2 } : {}) }; }),
        ...(d.owed.length ? [{ c: ["Total", "", "", money(total(d.owed.map((o) => o.balance)))], total: true }] : []),
      ],
      empty: "Nadie te debe dinero ahora.",
    }, {
      kind: "table", title: "Pagas esta semana", sub: "Facturas de proveedores por pagar en los próximos 7 días",
      cols: [{ h: "Proveedor", w: 0.5 }, { h: "Vence", w: 0.25 }, { h: "Monto", w: 0.25, right: true }],
      rows: [
        ...d.bills.map((b) => ({ c: [b.vendor || "Proveedor", `${dm(b.dueDate)}${b.late ? " · vencida" : ""}`, money(b.amount)], ...(b.late ? { red: 1 } : {}) })),
        ...(d.bills.length ? [{ c: ["Total", "", money(total(d.bills.map((b) => b.amount)))], total: true }] : []),
      ],
      empty: "No tienes facturas de proveedores por pagar esta semana.",
    });
  }
  return layoutPdf(
    { company: d.company, companyLine: d.companyLine, title: "Resumen semanal", generated: `${d.weekLabel.charAt(0).toUpperCase()}${d.weekLabel.slice(1)}` },
    kpis(d), sections,
    { footer: "Preparado con Personal & Business Solutions. Revisa estos números con tu contador.", page: (n, of) => `Página ${n} de ${of}`, cont: "(continúa)" },
  );
}

/** The PDF file. */
export function weeklyPdf(d: WeeklyDetail, created: Date): Uint8Array {
  return renderPdf(weeklyPages(d), { title: `Resumen semanal ${d.weekLabel}`, author: d.company, creator: "Personal & Business Solutions", created });
}

/** The Excel: the summary, the movements, who owes and what's due, with real totals and dates. */
export function weeklySheets(d: WeeklyDetail): SheetSpec[] {
  const sub = `${d.company} · semana ${d.weekLabel} · hecho con Personal & Business Solutions el ${d.madeOn}`;
  const k = weekKpis(d);
  const sheets: SheetSpec[] = [
    {
      name: "Resumen", title: "Resumen semanal", sub, widths: [30, 18, 26], freeze: 4,
      blocks: [{ cols: [{ h: "Concepto" }, { h: "Monto", t: "money" }, { h: "Detalle" }], rows: k.map((x) => ({ c: [x.label, x.amount, x.line] as CellInput[] })) }],
    },
    {
      name: "Movimientos", title: "Movimientos de la semana", sub, widths: [12, 40, 28, 14, 14], freeze: 4,
      blocks: [{
        filter: true,
        cols: [{ h: "Fecha", t: "date" }, { h: "Descripción" }, { h: "Cuenta" }, { h: "Entró", t: "money" }, { h: "Salió", t: "money" }],
        rows: [
          ...d.moves.map((m) => ({ c: [{ date: m.date }, m.description, m.account, m.moneyIn || null, m.moneyOut || null] as CellInput[] })),
          { c: ["Total", null, null, { sum: true, v: total(d.moves.map((m) => m.moneyIn)) }, { sum: true, v: total(d.moves.map((m) => m.moneyOut)) }], total: true },
        ],
      }],
    },
  ];
  if (d.w.mode === "business") {
    sheets.push({
      name: "Te deben", title: "Quién te debe", sub, widths: [32, 12, 14, 14], freeze: 4,
      blocks: [{
        cols: [{ h: "Cliente" }, { h: "Vence", t: "date" }, { h: "Días de atraso", t: "int" }, { h: "Saldo", t: "money" }],
        rows: [
          ...d.owed.map((o) => { const late = daysLate(o.dueDate, d.w.today); return { c: [o.client || "Cliente", o.dueDate ? { date: o.dueDate } : null, late, o.balance] as CellInput[], ...(late ? { warn: 2 } : {}) }; }),
          { c: ["Total", null, null, { sum: true, v: total(d.owed.map((o) => o.balance)) }], total: true },
        ],
      }],
    }, {
      name: "Por pagar", title: "Pagas esta semana", sub, widths: [32, 12, 14], freeze: 4,
      blocks: [{
        cols: [{ h: "Proveedor" }, { h: "Vence", t: "date" }, { h: "Monto", t: "money" }],
        rows: [
          ...d.bills.map((b) => ({ c: [b.vendor || "Proveedor", { date: b.dueDate }, b.amount] as CellInput[], ...(b.late ? { warn: 1 } : {}) })),
          { c: ["Total", null, { sum: true, v: total(d.bills.map((b) => b.amount)) }], total: true },
        ],
      }],
    });
  }
  return sheets;
}

export function weeklyXlsx(d: WeeklyDetail, created: Date): Uint8Array {
  return writeXlsx(weeklySheets(d), { title: `Resumen semanal ${d.weekLabel}`, creator: "Personal & Business Solutions", created, dateFormat: "mm/dd/yyyy" },
    XLSX.CFB as unknown as CfbLike);
}

/** "resumen-semanal-10-16-nov-2026" */
export function weeklyFileBase(w: Pick<Weekly, "from" | "to">): string {
  const a = part(w.from), b = part(w.to);
  return `resumen-semanal-${a.d}-${b.d}-${MONTHS[b.m].slice(0, 3)}-${b.y}`;
}
