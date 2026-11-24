// ── Ajustes: the business's details (receipts, invoices, quotes), its logo and the person's name ──
// The logo lives in its own table (created on first use), encrypted like receipts and tax documents
// (AES-256-GCM with TAX_FILES_KEY, api/lib/taxCrypto.ts), with a size limit and a real image-type check.
// `settings.get` hands it back as a data URL, so every document that already shows `logo` keeps working.
import { z } from "zod";
import { colorOf, setColor } from "./lib/userPrefs";
import { USER_COLORS } from "@contracts/bubble";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery, adminQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { companySettings, users } from "@db/schema";
import { eq, sql } from "drizzle-orm";
import { decryptTaxFile, encryptTaxFile, hasTaxKey } from "./lib/taxCrypto";
import { isMissingTable } from "./lib/dbErrors";
import { RateLimiter } from "./lib/security";
import bcrypt from "bcryptjs";
import type { Lang } from "./lib/i18n";

type Db = ReturnType<typeof getDb>;

// ── Logo rules (pure; also checked in the browser before uploading) ──

/** Largest logo accepted, in bytes. The page shrinks big photos before sending them. */
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

/** True when the bytes really are that kind of image (not just the name or the declared type). */
export function sniffLogo(buf: Uint8Array, mimeType: string): boolean {
  const at = (i: number) => buf[i];
  const ascii = (from: number, to: number) => String.fromCharCode(...Array.from(buf.subarray(from, to)));
  switch (mimeType) {
    case "image/png": return buf.length > 8 && at(0) === 0x89 && ascii(1, 4) === "PNG" && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a;
    case "image/jpeg": return buf.length > 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff;
    case "image/webp": return buf.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    default: return false;
  }
}

export type LogoCheck = { ok: true; buf: Buffer; mimeType: LogoType } | { ok: false; reason: "type" | "empty" | "tooBig" };

/** Checks an upload: an allowed type, real image bytes of that type, not empty and not over the limit. */
export function checkLogo(mimeType: string, dataBase64: string): LogoCheck {
  if (!(LOGO_TYPES as readonly string[]).includes(mimeType)) return { ok: false, reason: "type" };
  const buf = Buffer.from(dataBase64, "base64");
  if (buf.length === 0) return { ok: false, reason: "empty" };
  if (buf.length > LOGO_MAX_BYTES) return { ok: false, reason: "tooBig" };
  if (!sniffLogo(buf, mimeType)) return { ok: false, reason: "type" };
  return { ok: true, buf, mimeType: mimeType as LogoType };
}

/** "data:image/png;base64,…" → its type and bytes; null for anything else. */
export function parseLogoDataUrl(url: string): { mimeType: string; dataBase64: string } | null {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url.trim());
  return m ? { mimeType: m[1], dataBase64: m[2] } : null;
}

const MESSAGES: Record<Lang, Record<"type" | "empty" | "tooBig" | "noKey" | "wrongPassword" | "tooMany" | "noPassword", string>> = {
  es: {
    wrongPassword: "La contraseña actual no es correcta.",
    tooMany: "Demasiados intentos. Espera unos minutos y vuelve a probar.",
    noPassword: "Tu cuenta no tiene contraseña en esta app, así que no se puede cambiar aquí.",
    type: "Sube tu logo como imagen PNG, JPG o WEBP.",
    empty: "La imagen está vacía. Prueba con otra.",
    tooBig: "El logo pesa más de 512 KB. Prueba con una imagen más pequeña.",
    noKey: "Por ahora no podemos guardar logos. Inténtalo más tarde.",
  },
  en: {
    wrongPassword: "Your current password isn't right.",
    tooMany: "Too many tries. Wait a few minutes and try again.",
    noPassword: "Your account has no password in this app, so it can't be changed here.",
    type: "Upload your logo as a PNG, JPG or WEBP image.",
    empty: "The image is empty. Try another one.",
    tooBig: "The logo is larger than 512 KB. Try a smaller image.",
    noKey: "We can't store logos right now. Please try again later.",
  },
};
const say = (lang: Lang) => MESSAGES[lang] ?? MESSAGES.es;

// ── Logo table ──

let logoTableReady: Promise<void> | null = null;
function ensureLogoTable(db: Db): Promise<void> {
  logoTableReady ??= (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS companyLogos (
        userId BIGINT UNSIGNED NOT NULL PRIMARY KEY,
        mimeType VARCHAR(40) NOT NULL,
        size INT NOT NULL,
        data MEDIUMBLOB NOT NULL,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
  })().catch((e) => {
    logoTableReady = null;
    throw e;
  });
  return logoTableReady;
}

/** The business's logo as a data URL, or null (none, no key, or the table doesn't exist yet). */
export async function companyLogoDataUrl(db: Db, userId: number): Promise<string | null> {
  if (!hasTaxKey()) return null;
  try {
    const res = await db.execute(sql`SELECT mimeType, data FROM companyLogos WHERE userId = ${userId} LIMIT 1`);
    const row = (res as unknown as [Array<{ mimeType: string; data: Buffer }>])[0][0];
    if (!row) return null;
    return `data:${row.mimeType};base64,${decryptTaxFile(Buffer.from(row.data)).toString("base64")}`;
  } catch (e) {
    if (isMissingTable(e)) return null;
    console.error("[settings] logo couldn't be read", e instanceof Error ? e.message : e);
    return null;
  }
}

async function saveLogo(db: Db, userId: number, mimeType: string, dataBase64: string, lang: Lang): Promise<void> {
  const m = say(lang);
  const c = checkLogo(mimeType, dataBase64);
  if (!c.ok) throw new TRPCError({ code: "BAD_REQUEST", message: m[c.reason] });
  if (!hasTaxKey()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: m.noKey });
  await ensureLogoTable(db);
  const data = encryptTaxFile(c.buf);
  await db.execute(sql`
    INSERT INTO companyLogos (userId, mimeType, size, data) VALUES (${userId}, ${c.mimeType}, ${c.buf.length}, ${data})
    ON DUPLICATE KEY UPDATE mimeType = VALUES(mimeType), size = VALUES(size), data = VALUES(data), updatedAt = CURRENT_TIMESTAMP`);
  // The settings row must exist for settings.get to hand the logo back; an older logo kept
  // there as plain text stops being used.
  const existing: Array<{ id: number }> = await db.select({ id: companySettings.id }).from(companySettings).where(eq(companySettings.userId, userId)).limit(1);
  if (existing.length) await db.update(companySettings).set({ logo: null }).where(eq(companySettings.userId, userId));
  else await db.insert(companySettings).values({ userId, companyName: null, logo: null });
}

async function deleteLogo(db: Db, userId: number): Promise<void> {
  try { await db.execute(sql`DELETE FROM companyLogos WHERE userId = ${userId}`); } catch (e) { if (!isMissingTable(e)) throw e; }
  await db.update(companySettings).set({ logo: null }).where(eq(companySettings.userId, userId));
}

/** Account deletion: the logo goes too. */
export async function deleteUserLogo(db: Db, userId: number): Promise<void> {
  try { await db.execute(sql`DELETE FROM companyLogos WHERE userId = ${userId}`); } catch (e) { if (!isMissingTable(e)) throw e; }
}

const text = (max: number) => z.string().max(max).optional();

/** Wrong current passwords per person: 5 tries every 15 minutes (the same idea as the login limit). */
const passwordLimiter = new RateLimiter(5, 15 * 60 * 1000);
export const MIN_PASSWORD = 8;

export const settingsRouter = createRouter({
  // ── run DB migration for onboarding columns (DDL: admin only) ──
  migrate: adminQuery.query(async () => {
    const db = getDb();
    const results: string[] = [];
    const columns = [
      { name: "addressType", def: "VARCHAR(50)" },
      { name: "unitNumber", def: "VARCHAR(50)" },
      { name: "city", def: "VARCHAR(100)" },
      { name: "state", def: "VARCHAR(100)" },
      { name: "zipCode", def: "VARCHAR(20)" },
    ];
    for (const col of columns) {
      try {
        await db.execute(sql.raw(`ALTER TABLE companySettings ADD COLUMN ${col.name} ${col.def}`));
        results.push(`Added ${col.name}`);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("Duplicate") || message.includes("already exists")) {
          results.push(`${col.name} already exists`);
        } else {
          results.push(`Error ${col.name}: ${message}`);
        }
      }
    }
    return { success: true, results };
  }),
  // ── get: return ONLY the current user's settings + auto-migrate columns ──
  get: authedQuery.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const db = getDb();
    const userId = Number(ctx.user.id);

    // Auto-migrate: silently add missing columns (unitNumber, etc.)
    const migrateCols = [
      { name: "addressType", def: "VARCHAR(50)" },
      { name: "unitNumber", def: "VARCHAR(50)" },
      { name: "city", def: "VARCHAR(100)" },
      { name: "state", def: "VARCHAR(100)" },
      { name: "zipCode", def: "VARCHAR(20)" },
    ];
    for (const col of migrateCols) {
      try { await db.execute(sql.raw(`ALTER TABLE companySettings ADD COLUMN ${col.name} ${col.def}`)); } catch { /* already exists */ }
    }

    type Row = typeof companySettings.$inferSelect;
    const settings: Row[] = await db.select().from(companySettings)
      .where(eq(companySettings.userId, userId))
      .limit(1);
    const row = settings[0];
    if (!row) return null;
    // The encrypted logo wins; an older plain one is still shown if it's a real image.
    const stored = await companyLogoDataUrl(db, userId);
    const legacy = row.logo && parseLogoDataUrl(row.logo) ? row.logo : null;
    return { ...row, logo: stored ?? legacy };
  }),

  // ── update: update ONLY the current user's settings ──
  update: authedQuery
    .input(z.object({
      companyName: text(255),
      rif: text(50),
      address: text(500),
      addressType: text(50),
      unitNumber: text(50),
      city: text(100),
      state: text(100),
      zipCode: text(20),
      phone: text(50),
      email: text(320),
      zelleEmail: text(320),
      bankName: text(100),
      bankAccountNumber: text(50),
      currency: text(10),
      /** A data URL (png, jpeg or webp) to store as the logo, or "" to remove it. Same rules as uploadLogo. */
      logo: z.string().max(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 64).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const userId = Number(ctx.user.id);
      const { logo, ...data } = input;

      if (logo !== undefined) {
        if (logo === "") await deleteLogo(db, userId);
        else {
          const parsed = parseLogoDataUrl(logo);
          if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: say(ctx.lang).type });
          await saveLogo(db, userId, parsed.mimeType, parsed.dataBase64, ctx.lang);
        }
      }

      // Check if this user already has settings
      const existing: Array<{ id: number }> = await db.select({ id: companySettings.id }).from(companySettings)
        .where(eq(companySettings.userId, userId))
        .limit(1);

      if (existing.length > 0) {
        // Update only this user's settings
        if (Object.keys(data).length) {
          await db.update(companySettings).set(data)
            .where(eq(companySettings.userId, userId));
        }
        return { success: true, id: Number(existing[0].id) };
      } else {
        // Create new settings for this user
        const result = await db.insert(companySettings).values({
          ...data,
          userId,
        });
        return { success: true, id: Number(result[0].insertId) };
      }
    }),

  /** The logo for receipts, invoices and quotes: PNG, JPG or WEBP up to 512 KB, stored encrypted. */
  uploadLogo: authedQuery
    .input(z.object({
      mimeType: z.string().max(40),
      dataBase64: z.string().min(4).max(Math.ceil((LOGO_MAX_BYTES * 4) / 3) + 8),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await saveLogo(db, Number(ctx.user.id), input.mimeType, input.dataBase64, ctx.lang);
      return { ok: true };
    }),

  removeLogo: authedQuery.mutation(async ({ ctx }) => {
    await deleteLogo(getDb(), Number(ctx.user.id));
    return { ok: true };
  }),

  /**
   * Changes the password, knowing the current one. Sessions already open elsewhere stay open
   * (sign-in tokens aren't stored on the server); the page says so.
   */
  changePassword: authedQuery
    .input(z.object({ current: z.string().min(1).max(200), next: z.string().min(MIN_PASSWORD).max(200) }))
    .mutation(async ({ input, ctx }) => {
      const m = say(ctx.lang);
      const userId = Number(ctx.user.id);
      if (!passwordLimiter.consume(String(userId))) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: m.tooMany });
      const db = getDb();
      const row: { password: string | null } | undefined = (await db.select({ password: users.password }).from(users).where(eq(users.id, userId)).limit(1))[0];
      if (!row?.password) throw new TRPCError({ code: "BAD_REQUEST", message: m.noPassword });
      if (!(await bcrypt.compare(input.current, row.password))) throw new TRPCError({ code: "BAD_REQUEST", message: m.wrongPassword });
      await db.update(users).set({ password: await bcrypt.hash(input.next, 10) }).where(eq(users.id, userId));
      passwordLimiter.reset(String(userId));
      return { ok: true };
    }),

  /** The color of the person's own circle (the initial in the menu); blue when never chosen. */
  look: authedQuery.query(async ({ ctx }) => ({ color: await colorOf(getDb(), Number(ctx.user.id)) })),

  /** Ajustes › Perfil (or the assistant's bubble, with the same button): the circle's color, saved at once. */
  setColor: authedQuery
    .input(z.object({ color: z.enum(USER_COLORS) }))
    .mutation(async ({ input, ctx }) => {
      await setColor(getDb(), Number(ctx.user.id), input.color);
      return { color: input.color };
    }),

  /** The person's own name (the one in the menu and on the team). The email is their login and stays. */
  updateProfile: authedQuery
    .input(z.object({ name: z.string().trim().min(1).max(255) }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(users).set({ name: input.name }).where(eq(users.id, Number(ctx.user.id)));
      return { ok: true, name: input.name };
    }),
});
