// ── Clientes: what each client bought, owes and did (api/customers-router.ts) ──
// Reads sales (POS and invoices alike: an issued invoice IS a sale, "pending" while owed) and,
// when they exist, the Facturas and Cotizaciones tables (created on first use by their routers:
// a missing table just means nothing of that kind yet).
//
// What a client owes = for each of their pending sales, its total minus what was paid on it:
// the invoice's own payment log (Facturas), or, for an older sale without one, its payment
// records. Same rule as api/invoices-router.ts.
import { sql, type SQL } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { isMissingTable } from "./dbErrors";
import {
  DEFAULT_TERMS, addDays, averagePayDays, balanceCents, dayIn, findDuplicate, firstOfYear, isIdle, isLate, startOfDayIn, toCents,
  type ImportCandidate, type MoneyMove, type PayMethod,
} from "./ventas";

type Db = ReturnType<typeof getDb>;

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    if (result.length === 2 && Array.isArray(result[0])) return result[0] as T[];
    return result as T[];
  }
  return [];
}

/** Rows of a query on a table that may not exist yet (then: none). */
async function maybeRows<T>(db: Db, q: SQL): Promise<T[]> {
  try {
    return rowsOf<T>(await db.execute(q));
  } catch (e: unknown) {
    if (isMissingTable(e)) return [];
    throw e;
  }
}

const idList = (ids: readonly number[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);

// Times are read as UNIX_TIMESTAMP(column) and compared with FROM_UNIXTIME(seconds), so they mean the
// same instant whatever the time zone of this server and of the database session.
const fromTs = (ts: number | string | null | undefined) => new Date(Number(ts ?? 0) * 1000);
const epoch = (d: Date) => Math.floor(d.getTime() / 1000);

// ── What's owed ──

export type OpenSale = {
  saleId: number;
  customerId: number | null;
  number: string;
  totalCents: number;
  balanceCents: number;
  issueDay: string;
  dueDay: string;
  late: boolean;
  /** Has its own invoice row in Facturas. */
  hasInvoice: boolean;
};

type InvoiceRow = { id: number; saleId: number; issueDate: string | null; dueDate: string | null; termsDays: number; writtenOffAt: Date | null; voidedAt: Date | null; createdTs: number | string };

async function invoiceRows(db: Db, userId: number, saleIds: readonly number[]): Promise<Map<number, InvoiceRow>> {
  const out = new Map<number, InvoiceRow>();
  if (saleIds.length === 0) return out;
  const rows = await maybeRows<InvoiceRow>(db, sql`
    SELECT id, saleId, DATE_FORMAT(issueDate, '%Y-%m-%d') AS issueDate, DATE_FORMAT(dueDate, '%Y-%m-%d') AS dueDate, termsDays, writtenOffAt, voidedAt,
      UNIX_TIMESTAMP(createdAt) AS createdTs
    FROM invoices WHERE userId = ${userId} AND saleId IN (${idList(saleIds)})
  `);
  for (const r of rows) out.set(Number(r.saleId), { ...r, id: Number(r.id), saleId: Number(r.saleId), termsDays: Number(r.termsDays) });
  return out;
}

type Move = MoneyMove & { method: PayMethod; day: string; at: Date };

/** Money in and out per sale (see the top of the file). */
async function movesBySale(db: Db, userId: number, saleIds: readonly number[], tz: string): Promise<Map<number, Move[]>> {
  const out = new Map<number, Move[]>();
  if (saleIds.length === 0) return out;
  const own = await maybeRows<{ saleId: number; kind: "payment" | "refund"; method: PayMethod; amount: string; paidOn: string; ts: number | string }>(db, sql`
    SELECT saleId, kind, method, amount, DATE_FORMAT(paidOn, '%Y-%m-%d') AS paidOn, UNIX_TIMESTAMP(createdAt) AS ts FROM invoicePayments
    WHERE userId = ${userId} AND saleId IN (${idList(saleIds)}) ORDER BY paidOn, id
  `);
  for (const m of own) {
    const list = out.get(Number(m.saleId)) ?? [];
    list.push({ kind: m.kind, method: m.method, cents: toCents(m.amount), day: m.paidOn, at: fromTs(m.ts) });
    out.set(Number(m.saleId), list);
  }
  const legacy = saleIds.filter((id) => !out.has(id));
  if (legacy.length > 0) {
    // These ids are already this user's sales, so their payment records are too.
    const recs = rowsOf<{ saleId: number; method: PayMethod; amount: string; ts: number | string }>(await db.execute(sql`
      SELECT saleId, method, amount, UNIX_TIMESTAMP(createdAt) AS ts FROM paymentRecords WHERE saleId IN (${idList(legacy)}) ORDER BY id
    `));
    for (const p of recs) {
      const list = out.get(Number(p.saleId)) ?? [];
      list.push({ kind: "payment", method: p.method, cents: toCents(p.amount), day: dayIn(fromTs(p.ts), tz), at: fromTs(p.ts) });
      out.set(Number(p.saleId), list);
    }
  }
  return out;
}

/** Pending sales with something still owed (one client's, or everyone's). */
export async function openSales(db: Db, userId: number, tz: string, today: string, customerId?: number): Promise<OpenSale[]> {
  const pend = rowsOf<{ id: number; customerId: number | null; invoiceNumber: string; total: string; ts: number | string }>(await db.execute(sql`
    SELECT id, customerId, invoiceNumber, total, UNIX_TIMESTAMP(createdAt) AS ts FROM sales
    WHERE createdBy = ${userId} AND status = 'pending' ${customerId === undefined ? sql`` : sql`AND customerId = ${customerId}`}
    ORDER BY createdAt, id
  `));
  if (pend.length === 0) return [];
  const ids = pend.map((p) => Number(p.id));
  const inv = await invoiceRows(db, userId, ids);
  const moves = await movesBySale(db, userId, ids, tz);
  const out: OpenSale[] = [];
  for (const p of pend) {
    const id = Number(p.id);
    const meta = inv.get(id);
    if (meta?.writtenOffAt || meta?.voidedAt) continue;
    const totalCents = toCents(p.total);
    const bal = balanceCents(totalCents, moves.get(id) ?? []);
    if (bal <= 0) continue;
    const issueDay = meta?.issueDate ?? dayIn(fromTs(p.ts), tz);
    const dueDay = meta?.dueDate ?? addDays(issueDay, DEFAULT_TERMS);
    out.push({
      saleId: id, customerId: p.customerId === null ? null : Number(p.customerId), number: p.invoiceNumber, totalCents,
      balanceCents: bal, issueDay, dueDay, late: isLate(dueDay, today), hasInvoice: !!meta,
    });
  }
  return out;
}

// ── The list ──

export type OverviewRow = {
  customerId: number;
  name: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  /** Null when the plan or role doesn't include reports by client. */
  billedYearCents: number | null;
  owedCents: number;
  late: boolean;
  lastVisit: string | null;
  idle: boolean;
};

export type Overview = {
  today: string;
  canSeeBilled: boolean;
  rows: OverviewRow[];
  totals: { owedCents: number; oweCount: number; lateCount: number; idleCount: number };
  top: { id: number; name: string; owedCents: number } | null;
  idle: { id: number; name: string; lastVisit: string; phone: string | null; email: string | null } | null;
};

const nameOf = (r: { name: string; lastName: string | null }) => `${r.name}${r.lastName ? ` ${r.lastName}` : ""}`;

export async function customersOverview(db: Db, userId: number, tz: string, canSeeBilled: boolean): Promise<Overview> {
  const today = dayIn(new Date(), tz);
  const yearStart = startOfDayIn(firstOfYear(today), tz);
  type Agg = { customerId: number; name: string; lastName: string | null; phone: string | null; email: string | null; billedYear: string | null; lifetime: string | null; lastTs: number | string | null };
  const agg = rowsOf<Agg>(await db.execute(sql`
    SELECT s.customerId, c.name, c.lastName, c.phone, c.email,
      SUM(CASE WHEN s.createdAt >= FROM_UNIXTIME(${epoch(yearStart)}) THEN s.total ELSE 0 END) AS billedYear,
      SUM(s.total) AS lifetime,
      UNIX_TIMESTAMP(MAX(s.createdAt)) AS lastTs
    FROM sales s JOIN customers c ON c.id = s.customerId AND c.userId = ${userId}
    WHERE s.createdBy = ${userId} AND s.status IN ('completed', 'pending')
    GROUP BY s.customerId, c.name, c.lastName, c.phone, c.email
  `));
  const open = await openSales(db, userId, tz, today);
  const owed = new Map<number, { cents: number; late: boolean }>();
  for (const o of open) {
    if (o.customerId === null) continue;
    const cur = owed.get(o.customerId) ?? { cents: 0, late: false };
    owed.set(o.customerId, { cents: cur.cents + o.balanceCents, late: cur.late || o.late });
  }

  // Every client who owes has a pending sale, so they're all in `agg` (only this user's clients are).
  const rows: OverviewRow[] = [];
  for (const a of agg) {
    const id = Number(a.customerId);
    const lastVisit = a.lastTs ? dayIn(fromTs(a.lastTs), tz) : null;
    const o = owed.get(id);
    rows.push({
      customerId: id, name: a.name, lastName: a.lastName, phone: a.phone, email: a.email, billedYearCents: canSeeBilled ? toCents(a.billedYear ?? 0) : null, owedCents: o?.cents ?? 0, late: o?.late ?? false,
      lastVisit, idle: isIdle(lastVisit, today),
    });
  }

  const byId = new Map(agg.map((a) => [Number(a.customerId), a]));
  const debtors = rows.filter((r) => r.owedCents > 0).sort((a, b) => b.owedCents - a.owedCents);
  const topRow = debtors[0];
  const topAgg = topRow ? byId.get(topRow.customerId) : undefined;
  // Who to win back: of the clients who stopped coming, the one who has spent the most.
  const idleRows = rows.filter((r) => r.idle).sort((a, b) => toCents(byId.get(b.customerId)?.lifetime ?? 0) - toCents(byId.get(a.customerId)?.lifetime ?? 0));
  const idleAgg = idleRows[0] ? byId.get(idleRows[0].customerId) : undefined;
  const topName = topAgg ? nameOf(topAgg) : null;

  return {
    today,
    canSeeBilled,
    rows,
    totals: {
      owedCents: rows.reduce((s, r) => s + r.owedCents, 0),
      oweCount: debtors.length,
      lateCount: rows.filter((r) => r.late).length,
      idleCount: idleRows.length,
    },
    top: topRow && topName ? { id: topRow.customerId, name: topName, owedCents: topRow.owedCents } : null,
    idle: idleAgg && idleRows[0].lastVisit
      ? { id: idleRows[0].customerId, name: nameOf(idleAgg), lastVisit: idleRows[0].lastVisit, phone: idleAgg.phone, email: idleAgg.email }
      : null,
  };
}

// ── One client ──

export type TimelineKind =
  | "joined" | "sale" | "invoice" | "sent" | "reminder" | "payment" | "refund" | "void" | "writeoff" | "late" | "cancelled"
  | "quote" | "quoteAccepted" | "quoteRejected" | "quoteConverted";

export type TimelineEvent = {
  id: string;
  at: Date;
  day: string;
  kind: TimelineKind;
  tone: "good" | "bad" | "info";
  number?: string;
  cents?: number;
  method?: string;
  channel?: string;
  left?: number;
};

export type CustomerDetail = {
  customer: {
    id: number; name: string; lastName: string | null; email: string | null; phone: string | null; address: string | null;
    notes: string | null; createdAt: Date;
  };
  today: string;
  kpis: { billedYearCents: number; salesYear: number; owedCents: number; hasLate: boolean; payDays: number | null; lastTermsDays: number | null };
  open: OpenSale[];
  /** What they buy most, by units. */
  bought: Array<{ name: string; quantity: number; totalCents: number }>;
  sales: Array<{ id: number; number: string; at: Date; day: string; totalCents: number; method: string; status: string; isInvoice: boolean; items: Array<{ name: string; quantity: number }> }>;
  timeline: TimelineEvent[];
};

function parseDetail(raw: unknown): Record<string, unknown> {
  let v: unknown = raw;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return {}; }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function customerDetail(db: Db, userId: number, customerId: number, tz: string): Promise<CustomerDetail | null> {
  type C = Omit<CustomerDetail["customer"], "createdAt"> & { ts: number | string };
  const c = rowsOf<C>(await db.execute(sql`
    SELECT id, name, lastName, email, phone, address, notes, UNIX_TIMESTAMP(createdAt) AS ts FROM customers WHERE id = ${customerId} AND userId = ${userId} LIMIT 1
  `))[0];
  if (!c) return null;
  const today = dayIn(new Date(), tz);
  const yearStartDay = firstOfYear(today);

  type S = { id: number; invoiceNumber: string; total: string; paymentMethod: string; status: string; createdAt: Date; updatedAt: Date };
  const saleRows: S[] = rowsOf<Omit<S, "createdAt" | "updatedAt"> & { cTs: number | string; uTs: number | string }>(await db.execute(sql`
    SELECT id, invoiceNumber, total, paymentMethod, status, UNIX_TIMESTAMP(createdAt) AS cTs, UNIX_TIMESTAMP(updatedAt) AS uTs FROM sales
    WHERE createdBy = ${userId} AND customerId = ${customerId} ORDER BY createdAt DESC, id DESC LIMIT 300
  `)).map(({ cTs, uTs, ...r }) => ({ ...r, createdAt: fromTs(cTs), updatedAt: fromTs(uTs) }));
  const saleIds = saleRows.map((s) => Number(s.id));
  const inv = await invoiceRows(db, userId, saleIds);
  const items = saleIds.length === 0 ? [] : rowsOf<{ saleId: number; serviceName: string; quantity: number; total: string }>(await db.execute(sql`
    SELECT saleId, serviceName, quantity, total FROM saleServices WHERE saleId IN (${idList(saleIds)}) ORDER BY id
  `));
  const itemsBySale = new Map<number, Array<{ name: string; quantity: number }>>();
  const boughtMap = new Map<string, { name: string; quantity: number; totalCents: number }>();
  const liveSale = new Set(saleRows.filter((s) => s.status === "completed" || s.status === "pending").map((s) => Number(s.id)));
  for (const it of items) {
    const sid = Number(it.saleId);
    const list = itemsBySale.get(sid) ?? [];
    list.push({ name: it.serviceName, quantity: Number(it.quantity) });
    itemsBySale.set(sid, list);
    if (!liveSale.has(sid)) continue;
    const key = it.serviceName.trim().toLowerCase();
    const cur = boughtMap.get(key) ?? { name: it.serviceName, quantity: 0, totalCents: 0 };
    cur.quantity += Number(it.quantity);
    cur.totalCents += toCents(it.total);
    boughtMap.set(key, cur);
  }

  const open = await openSales(db, userId, tz, today, customerId);
  const moves = await movesBySale(db, userId, saleIds, tz);

  // KPIs
  const thisYear = saleRows.filter((s) => liveSale.has(Number(s.id)) && dayIn(new Date(s.createdAt), tz) >= yearStartDay);
  const paidInvoices: Array<{ issueDay: string; paidDay: string }> = [];
  let lastTermsDays: number | null = null;
  let lastInvoiceAt = 0;
  for (const s of saleRows) {
    const meta = inv.get(Number(s.id));
    if (!meta) continue;
    if (Number(meta.createdTs) > lastInvoiceAt) { lastInvoiceAt = Number(meta.createdTs); lastTermsDays = meta.termsDays; }
    if (s.status !== "completed" || meta.writtenOffAt) continue;
    const pays = (moves.get(Number(s.id)) ?? []).filter((m) => m.kind === "payment");
    if (pays.length === 0) continue;
    paidInvoices.push({ issueDay: meta.issueDate ?? dayIn(new Date(s.createdAt), tz), paidDay: pays[pays.length - 1].day });
  }

  // Timeline
  const tl: TimelineEvent[] = [];
  const push = (e: Omit<TimelineEvent, "day">) => tl.push({ ...e, day: dayIn(e.at, tz) });
  push({ id: "joined", at: fromTs(c.ts), kind: "joined", tone: "info" });

  const invIds = [...inv.values()].map((m) => m.id);
  const events = invIds.length === 0 ? [] : await maybeRows<{ id: number; invoiceId: number; type: string; detail: unknown; ts: number | string }>(db, sql`
    SELECT id, invoiceId, type, detail, UNIX_TIMESTAMP(at) AS ts FROM invoiceEvents WHERE userId = ${userId} AND invoiceId IN (${idList(invIds)}) ORDER BY at, id LIMIT 500
  `);
  const saleByInvoice = new Map([...inv.values()].map((m) => [m.id, m.saleId]));
  const saleById = new Map(saleRows.map((s) => [Number(s.id), s]));
  for (const e of events) {
    const sale = saleById.get(saleByInvoice.get(Number(e.invoiceId)) ?? -1);
    if (!sale) continue;
    const d = parseDetail(e.detail);
    const num = (k: string) => (typeof d[k] === "number" ? (d[k] as number) : undefined);
    const base = { id: `e${e.id}`, at: fromTs(e.ts), number: sale.invoiceNumber };
    switch (e.type) {
      case "created": case "issued": push({ ...base, kind: "invoice", tone: "info", cents: toCents(sale.total) }); break;
      case "sent": push({ ...base, kind: "sent", tone: "info", channel: typeof d.channel === "string" ? d.channel : undefined }); break;
      case "reminder": push({ ...base, kind: "reminder", tone: "info" }); break;
      case "payment": push({ ...base, kind: "payment", tone: "good", cents: num("amount"), method: typeof d.method === "string" ? d.method : undefined, left: num("left") }); break;
      case "refund": push({ ...base, kind: "refund", tone: "bad", cents: num("amount") }); break;
      case "void": push({ ...base, kind: "void", tone: "bad" }); break;
      case "writeoff": push({ ...base, kind: "writeoff", tone: "bad", cents: num("amount") }); break;
      default: break;
    }
  }
  for (const s of saleRows) {
    const id = Number(s.id);
    const at = new Date(s.createdAt);
    if (inv.has(id)) continue; // its history came from Facturas above
    const cents = toCents(s.total);
    if (s.status === "pending") {
      push({ id: `s${id}`, at, kind: "invoice", tone: "info", number: s.invoiceNumber, cents });
      for (const [k, m] of (moves.get(id) ?? []).entries()) {
        push({ id: `p${id}-${k}`, at: m.at, kind: m.kind === "payment" ? "payment" : "refund", tone: m.kind === "payment" ? "good" : "bad", number: s.invoiceNumber, cents: m.cents, method: m.method });
      }
    } else {
      push({ id: `s${id}`, at, kind: "sale", tone: "good", number: s.invoiceNumber, cents, method: s.paymentMethod });
      if (s.status === "cancelled" || s.status === "refunded") push({ id: `x${id}`, at: new Date(s.updatedAt), kind: "cancelled", tone: "bad", number: s.invoiceNumber, cents });
    }
  }
  for (const o of open) {
    if (o.late) push({ id: `l${o.saleId}`, at: startOfDayIn(addDays(o.dueDay, 1), tz), kind: "late", tone: "bad", number: o.number, cents: o.balanceCents });
  }
  const quotes = await maybeRows<{ id: number; number: string; status: string; total: string; cTs: number | string; uTs: number | string }>(db, sql`
    SELECT id, number, status, total, UNIX_TIMESTAMP(createdAt) AS cTs, UNIX_TIMESTAMP(updatedAt) AS uTs FROM quotes WHERE userId = ${userId} AND customerId = ${customerId} ORDER BY createdAt DESC LIMIT 100
  `);
  for (const q of quotes) {
    push({ id: `q${q.id}`, at: fromTs(q.cTs), kind: "quote", tone: "info", number: q.number, cents: toCents(q.total) });
    const kind: TimelineKind | null = q.status === "accepted" ? "quoteAccepted" : q.status === "rejected" ? "quoteRejected" : q.status === "converted" ? "quoteConverted" : null;
    if (kind) push({ id: `q${q.id}s`, at: fromTs(q.uTs), kind, tone: kind === "quoteRejected" ? "bad" : "good", number: q.number });
  }
  tl.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));

  return {
    customer: { id: Number(c.id), name: c.name, lastName: c.lastName, email: c.email, phone: c.phone, address: c.address, notes: c.notes, createdAt: fromTs(c.ts) },
    today,
    kpis: {
      billedYearCents: thisYear.reduce((s, x) => s + toCents(x.total), 0),
      salesYear: thisYear.length,
      owedCents: open.reduce((s, o) => s + o.balanceCents, 0),
      hasLate: open.some((o) => o.late),
      payDays: averagePayDays(paidInvoices),
      lastTermsDays,
    },
    open,
    bought: [...boughtMap.values()].sort((a, b) => b.quantity - a.quantity || b.totalCents - a.totalCents).slice(0, 6),
    sales: saleRows.slice(0, 50).map((s) => ({
      id: Number(s.id), number: s.invoiceNumber, at: new Date(s.createdAt), day: dayIn(new Date(s.createdAt), tz), totalCents: toCents(s.total),
      method: s.paymentMethod, status: s.status, isInvoice: inv.has(Number(s.id)) || s.status === "pending", items: itemsBySale.get(Number(s.id)) ?? [],
    })),
    timeline: tl.slice(0, 80),
  };
}

// ── Importing ──

export type ImportRowInput = { name: string; lastName?: string; email?: string; phone?: string; address?: string; notes?: string };
export type ImportResult = { newCount: number; mergeCount: number; mergeNames: string[]; repeatedInFile: number; created: number; merged: number; errors: number };

export async function importMerge(db: Db, userId: number, rows: readonly ImportRowInput[], dryRun: boolean): Promise<ImportResult> {
  type E = ImportCandidate & { id: number; address: string | null; notes: string | null };
  const existing = rowsOf<E>(await db.execute(sql`SELECT id, name, lastName, email, phone, address, notes FROM customers WHERE userId = ${userId}`))
    .map((e) => ({ ...e, id: Number(e.id) }));
  const fresh: ImportCandidate[] = [];
  const res: ImportResult = { newCount: 0, mergeCount: 0, mergeNames: [], repeatedInFile: 0, created: 0, merged: 0, errors: 0 };
  const touched = new Set<number>();
  const blank = (v: string | null | undefined) => !v || !v.trim();

  for (const raw of rows) {
    const row = { ...raw, name: raw.name.trim() };
    if (!row.name) continue;
    if (findDuplicate(row, fresh) >= 0) { res.repeatedInFile++; continue; }
    const dup = findDuplicate(row, existing);
    if (dup >= 0) {
      const e = existing[dup];
      if (touched.has(e.id)) { res.repeatedInFile++; continue; }
      touched.add(e.id);
      res.mergeCount++;
      if (res.mergeNames.length < 3) res.mergeNames.push(nameOf({ name: e.name, lastName: e.lastName ?? null }));
      if (dryRun) continue;
      // Only fill in what the client was missing; never overwrite what's there.
      const set: Record<string, string> = {};
      if (blank(e.lastName) && row.lastName) set.lastName = row.lastName;
      if (blank(e.email) && row.email) set.email = row.email;
      if (blank(e.phone) && row.phone) set.phone = row.phone;
      if (blank(e.address) && row.address) set.address = row.address;
      if (blank(e.notes) && row.notes) set.notes = row.notes;
      try {
        const keys = Object.keys(set);
        if (keys.length > 0) {
          await db.execute(sql`UPDATE customers SET ${sql.join(keys.map((k) => sql`${sql.identifier(k)} = ${set[k]}`), sql`, `)}, updatedAt = CURRENT_TIMESTAMP WHERE id = ${e.id} AND userId = ${userId}`);
        }
        res.merged++;
      } catch {
        res.errors++;
      }
      continue;
    }
    fresh.push(row);
    res.newCount++;
    if (dryRun) continue;
    try {
      await db.execute(sql`
        INSERT INTO customers (userId, name, lastName, email, phone, address, notes, clientType)
        VALUES (${userId}, ${row.name}, ${row.lastName || null}, ${row.email || null}, ${row.phone || null}, ${row.address || null}, ${row.notes || null}, 'placas')
      `);
      res.created++;
    } catch {
      res.errors++;
    }
  }
  return res;
}
