// ── Merchant logos: Plaid's logo_url, kept per merchant and added to bank rows as `logoUrl` ──
// Every sync path that receives Plaid transactions calls rememberMerchantLogos(); every list of bank rows
// that the app shows goes through withMerchantLogos(). The table only holds public brand data taken from
// Plaid's merchant fields (never a raw bank description), so it is shared by all users.
import { inArray, sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { bundledLogoFor, candidateKeys, merchantBrandOf, safeLogoUrl, type PlaidTxBrand } from "./brand";
import { merchantLogosTable } from "./brandSchema";
import { ensureBrandTables } from "./brandTables";

type Db = ReturnType<typeof getDb>;

/** What a bank row needs to find its merchant's logo. Select `merchantName` too when you can: it matches best. */
export type LogoLookupRow = { merchantName?: string | null; description?: string | null; logoUrl?: string | null };

// What this process last wrote per merchant, so a page view doesn't rewrite the same rows again and again.
const written = new Map<string, string>();
const WRITTEN_MAX = 5000;

/**
 * Saves the logo and website Plaid sent with these transactions (merchant_name / counterparties).
 * Best effort: never throws. Returns how many merchants were written.
 */
export async function rememberMerchantLogos(db: Db, txs: ReadonlyArray<PlaidTxBrand | null | undefined>): Promise<number> {
  try {
    const byKey = new Map<string, { key: string; name: string; logoUrl: string | null; website: string | null }>();
    for (const tx of txs) {
      const b = tx ? merchantBrandOf(tx) : null;
      if (!b) continue;
      const prev = byKey.get(b.key);
      byKey.set(b.key, prev ? { ...prev, logoUrl: prev.logoUrl ?? b.logoUrl, website: prev.website ?? b.website } : b);
    }
    const fresh = [...byKey.values()].filter((b) => written.get(b.key) !== `${b.logoUrl ?? ""}|${b.website ?? ""}|${b.name}`);
    if (fresh.length === 0) return 0;
    await ensureBrandTables(db);
    for (const b of fresh) {
      // A newer logo replaces the old one; a missing one never erases what we have.
      await db.execute(sql`
        INSERT INTO merchantLogos (merchantKey, name, logoUrl, website)
        VALUES (${b.key}, ${b.name}, ${b.logoUrl}, ${b.website})
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          logoUrl = COALESCE(VALUES(logoUrl), logoUrl),
          website = COALESCE(VALUES(website), website),
          updatedAt = CURRENT_TIMESTAMP
      `);
      if (written.size >= WRITTEN_MAX) written.clear();
      written.set(b.key, `${b.logoUrl ?? ""}|${b.website ?? ""}|${b.name}`);
    }
    return fresh.length;
  } catch (e: unknown) {
    console.error("[merchantLogos] save failed:", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** The saved logo for each merchant key asked for (keys without a logo are left out). */
async function logosFor(db: Db, keys: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (keys.length === 0) return found;
  await ensureBrandTables(db);
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = keys.slice(i, i + 500);
    const rows: Array<{ merchantKey: string; logoUrl: string | null }> = await db
      .select({ merchantKey: merchantLogosTable.merchantKey, logoUrl: merchantLogosTable.logoUrl })
      .from(merchantLogosTable)
      .where(inArray(merchantLogosTable.merchantKey, chunk));
    for (const r of rows) {
      const url = safeLogoUrl(r.logoUrl);
      if (url) found.set(r.merchantKey, url);
    }
  }
  return found;
}

/**
 * Adds `logoUrl: string | null` to bank rows: the logo the row already carries (straight from Plaid), else
 * the saved logo of its merchant, matched by merchant name and then by the first words of the description.
 * A brand whose current logo is saved with the app (bundledLogoFor) gets that one first.
 * Never throws: on any database problem the rows come back with `logoUrl: null`.
 */
export async function withMerchantLogos<T extends LogoLookupRow>(db: Db, rows: T[]): Promise<Array<T & { logoUrl: string | null }>> {
  const keysPerRow = rows.map((r) => (safeLogoUrl(r.logoUrl) ? [] : candidateKeys(r)));
  let found = new Map<string, string>();
  try {
    found = await logosFor(db, [...new Set(keysPerRow.flat())]);
  } catch (e: unknown) {
    console.error("[merchantLogos] lookup failed:", e instanceof Error ? e.message : e);
  }
  return rows.map((r, i) => {
    const own = safeLogoUrl(r.logoUrl);
    // The brand's current logo saved with the app first (Plaid's can be an older version), then Plaid's.
    const match = bundledLogoFor(r) ?? own ?? keysPerRow[i].map((k) => found.get(k)).find(Boolean) ?? null;
    return { ...r, logoUrl: match };
  });
}
