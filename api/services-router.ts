import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { services } from "@db/schema";
import { eq, like, sql } from "drizzle-orm";
import { dayIn, firstOfMonth, isValidTimeZone, startOfDayIn } from "./lib/ventas";
import { BUSINESS_TIME_ZONE } from "./lib/quotes";

type Db = ReturnType<typeof getDb>;

// ── Product or service, and stock (a side table, created on first use) ──
// `services` has no type or stock columns; they live here, one row per service that has them.
// A service without a row is a service with no stock tracking. Selling a tracked product lowers
// its stock in the sale's own transaction (api/sales-router.ts).

let extrasReady: Promise<void> | null = null;

export function ensureServiceExtras(db: Db): Promise<void> {
  extrasReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS serviceExtras (
        serviceId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        userId BIGINT UNSIGNED NOT NULL,
        kind ENUM('service', 'product') NOT NULL DEFAULT 'service',
        trackStock BOOLEAN NOT NULL DEFAULT FALSE,
        stock INT NOT NULL DEFAULT 0,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX serviceExtras_userId_idx (userId)
      )
    `);
  })().catch((e: unknown) => {
    extrasReady = null;
    throw e;
  });
  return extrasReady;
}

/** Deletes a user's product/stock details (account deletion; `services` rows cascade on their own). */
export async function deleteUserServiceExtras(db: Db, userId: number): Promise<void> {
  await ensureServiceExtras(db);
  await db.execute(sql`DELETE FROM serviceExtras WHERE userId = ${userId}`);
}

/** Rows of a raw `db.execute` (mysql2 returns [rows, fields]). */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    if (result.length === 2 && Array.isArray(result[0])) return result[0] as T[];
    return result as T[];
  }
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}

/**
 * Seconds since 1970 for a moment. Times are compared in SQL as FROM_UNIXTIME(seconds) and read as
 * UNIX_TIMESTAMP(column), so they mean the same instant whatever the time zone of the server and
 * of the database session.
 */
export const epoch = (d: Date) => Math.floor(d.getTime() / 1000);

const kindInput = z.enum(["service", "product"]);
/** Units on hand; null = don't keep count. */
const stockInput = z.number().int().min(-1_000_000).max(1_000_000).nullable();
const tzInput = z.string().max(64).refine(isValidTimeZone);

/** Saves a service's type and stock (only the fields given). The service must be this user's. */
async function saveExtras(db: Db, userId: number, serviceId: number, x: { kind?: "service" | "product"; stock?: number | null }): Promise<void> {
  if (x.kind === undefined && x.stock === undefined) return;
  const own = rowsOf<{ id: number }>(await db.execute(sql`SELECT id FROM services WHERE id = ${serviceId} AND userId = ${userId} LIMIT 1`));
  if (own.length === 0) return;
  const cur = rowsOf<{ kind: "service" | "product"; trackStock: number; stock: number }>(
    await db.execute(sql`SELECT kind, trackStock, stock FROM serviceExtras WHERE serviceId = ${serviceId} AND userId = ${userId} LIMIT 1`),
  )[0];
  const kind = x.kind ?? cur?.kind ?? "service";
  const track = x.stock === undefined ? Boolean(cur?.trackStock) : x.stock !== null;
  const stock = x.stock === undefined ? Number(cur?.stock ?? 0) : (x.stock ?? 0);
  await db.execute(sql`
    INSERT INTO serviceExtras (serviceId, userId, kind, trackStock, stock, updatedAt)
    VALUES (${serviceId}, ${userId}, ${kind}, ${track ? 1 : 0}, ${stock}, CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE kind = VALUES(kind), trackStock = VALUES(trackStock), stock = VALUES(stock), updatedAt = VALUES(updatedAt)
  `);
}

export type ServiceListRow = {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  price: string;
  cost: string | null;
  categoryId: number | null;
  isActive: number | boolean | null;
  createdAt: Date;
  updatedAt: Date;
  kind: "service" | "product";
  trackStock: boolean;
  stock: number;
  /** Units sold this calendar month (completed and pending sales). */
  soldThisMonth: number;
};

export const servicesRouter = createRouter({
  debug: authedQuery.query(async ({ ctx }) => {
    const db = getDb();
    const cols = await db.execute(sql`SHOW COLUMNS FROM services`);
    // Scoped to the caller: this used to return the latest services of ALL tenants.
    const all = await db.execute(sql`SELECT id, userId, name, description, price, cost, isActive, createdAt FROM services WHERE userId = ${ctx.user.id} ORDER BY id DESC LIMIT 10`);
    return {
      currentUserId: ctx.user?.id ?? null,
      columns: cols,
      recentRecords: Array.isArray(all) ? (all.length === 2 && Array.isArray(all[0]) ? all[0] : all) : [],
    };
  }),

  /** The catalog, with each item's type, stock and units sold this month. Same rows as before, plus those fields. */
  list: authedQuery
    .input(z.object({ timeZone: tzInput.optional() }).optional())
    .query(async ({ ctx, input }): Promise<ServiceListRow[]> => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      await ensureServiceExtras(db);
      const tz = input?.timeZone ?? BUSINESS_TIME_ZONE;
      const monthStart = startOfDayIn(firstOfMonth(dayIn(new Date(), tz)), tz);
      type Raw = Omit<ServiceListRow, "trackStock" | "stock" | "soldThisMonth"> & { trackStock: number | string; stock: number | string; soldThisMonth: number | string | null };
      const rows = rowsOf<Raw>(await db.execute(sql`
        SELECT s.id, s.userId, s.name, s.description, s.price, s.cost, s.categoryId, s.isActive, s.createdAt, s.updatedAt,
          COALESCE(x.kind, 'service') AS kind, COALESCE(x.trackStock, 0) AS trackStock, COALESCE(x.stock, 0) AS stock,
          COALESCE(sold.units, 0) AS soldThisMonth
        FROM services s
        LEFT JOIN serviceExtras x ON x.serviceId = s.id AND x.userId = s.userId
        LEFT JOIN (
          SELECT ss.serviceId, SUM(ss.quantity) AS units
          FROM saleServices ss JOIN sales sa ON sa.id = ss.saleId
          WHERE sa.createdBy = ${userId} AND sa.createdAt >= FROM_UNIXTIME(${epoch(monthStart)}) AND sa.status IN ('completed', 'pending')
          GROUP BY ss.serviceId
        ) sold ON sold.serviceId = s.id
        WHERE s.userId = ${userId}
        ORDER BY s.name
      `));
      return rows.map((r) => ({
        ...r,
        kind: r.kind === "product" ? "product" : "service",
        trackStock: Number(r.trackStock) === 1,
        stock: Number(r.stock) || 0,
        soldThisMonth: Number(r.soldThisMonth) || 0,
      }));
    }),

  byId: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;
      if (userId) {
        const s = await db.select().from(services).where(
          sql`${services.id} = ${input.id} AND ${services.userId} = ${userId}`
        ).limit(1);
        return s[0] ?? null;
      }
      const s = await db.select().from(services).where(eq(services.id, input.id)).limit(1);
      return s[0] ?? null;
    }),

  create: authedQuery
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      price: z.string().or(z.number()),
      cost: z.string().or(z.number()).optional(),
      image: z.string().optional(),
      isActive: z.boolean().optional(),
      kind: kindInput.optional(),
      stock: stockInput.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      if (input.kind !== undefined || input.stock !== undefined) await ensureServiceExtras(db);
      return db.transaction(async (tx: Db) => {
        // Use raw SQL matching the actual DB schema (no image column in Railway DB)
        const result = await tx.execute(sql`
          INSERT INTO services (userId, name, description, price, cost, isActive)
          VALUES (${userId}, ${input.name}, ${input.description || ""}, ${String(input.price)}, ${input.cost ? String(input.cost) : "0"}, ${input.isActive ?? true ? 1 : 0})
        `);
        const id = Number(result[0].insertId);
        await saveExtras(tx, userId, id, { kind: input.kind, stock: input.stock });
        return { id };
      });
    }),

  update: authedQuery
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      price: z.string().or(z.number()).optional(),
      cost: z.string().or(z.number()).optional(),
      image: z.string().optional(),
      isActive: z.boolean().optional(),
      kind: kindInput.optional(),
      stock: stockInput.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const { id, kind, stock, ...data } = input;
      const upd: Record<string, unknown> = { ...data };
      if (data.price !== undefined) upd.price = String(data.price);
      if (data.cost !== undefined) upd.cost = String(data.cost);
      if (kind !== undefined || stock !== undefined) await ensureServiceExtras(db);
      await db.transaction(async (tx: Db) => {
        // Only update if the service belongs to the current user
        if (Object.keys(upd).length > 0) {
          await tx.update(services).set(upd).where(sql`${services.id} = ${id} AND ${services.userId} = ${userId}`);
        }
        await saveExtras(tx, userId, id, { kind, stock });
      });
      return { success: true };
    }),

  delete: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      // Only delete if the service belongs to the current user
      await db.delete(services).where(
        sql`${services.id} = ${input.id} AND ${services.userId} = ${ctx.user.id}`
      );
      // Its type and stock go with it (a sold service can't be deleted: the line above throws first).
      await ensureServiceExtras(db);
      await db.execute(sql`DELETE FROM serviceExtras WHERE serviceId = ${input.id} AND userId = ${ctx.user.id}`);
      return { success: true };
    }),

  search: authedQuery
    .input(z.object({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const userId = ctx.user?.id ?? null;
      if (userId) {
        return db.select().from(services).where(
          sql`${like(services.name, `%${input.query}%`)} AND ${services.userId} = ${userId}`
        ).limit(20);
      }
      return db.select().from(services).where(like(services.name, `%${input.query}%`)).limit(20);
    }),
});

export const productsRouter = servicesRouter;
