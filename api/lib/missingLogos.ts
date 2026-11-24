// Admin · Sistema, "Comercios sin logo": the businesses people pay most often that still show a plain letter, so
// the owner knows which logos to add next (public/brands/merchants/ + MERCHANT_ICONS in api/lib/brand.ts). Only
// purchases and bills: no transfers, Zelle, cash, deposits or paychecks (those are people, not businesses), and no
// government offices (they never get a logo). Grouped by business, not by person: no names of customers.
import { sql } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { candidateKeys, isBankOwnMovement } from "./brand";
import { withMerchantLogos } from "./merchantLogos";
import { rowsOf } from "./support";

type Db = ReturnType<typeof getDb>;

/** Categories that are never a business with a logo. */
const NOT_A_BUSINESS = ["transfer", "transfer_income", "zelle_sent", "zelle_income", "cash_withdrawal", "cash_deposit", "cash_income", "deposit", "paycheck", "income", "general", "government"];
/** A US state code at the end of the bank's text ("HOOVER AL"). */
const US_STATE = /^(?:al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc)$/i;
/** How far back it looks, and how many it lists. */
export const MISSING_LOGO_DAYS = 90;
export const MISSING_LOGO_MAX = 40;

export type MissingLogoRow = { merchantName: string | null; description: string; n: number | string; people: number | string; last: string | Date | null };
export type MissingLogo = { name: string; sample: string; count: number; people: number; last: string | null };

/** The business's name as people would say it, from the bank's text: its first words, before any store number ("STARBUCKS STORE 12345" → "Starbucks Store"). */
export function businessLabel(text: string): string {
  const words = text.replace(/[*#]/g, " ").split(/\s+/).filter(Boolean);
  const noise = /^(?:purchase|authorized|auth|on|pos|debit|credit|card|checkcard|recurring|payment|pmt|online|ach|web|sq|tst|dd|sp|the|\d[\d/.-]*)$/i;
  let i = 0;
  while (i < words.length && noise.test(words[i])) i++;
  const out: string[] = [];
  for (const w of words.slice(i)) {
    if (/\d/.test(w) || out.length === 3) break;
    out.push(w);
  }
  if (out.length > 1 && US_STATE.test(out[out.length - 1])) out.pop();
  const s = (out.length ? out : words.slice(i, i + 2)).join(" ");
  return s.toLowerCase().replace(/(^|[\s&-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).slice(0, 60);
}

/**
 * The rows without a logo, one per business (its shortest merchant key), most used first. `hasLogo[i]` says whether
 * row i found one. Pure, for the tests.
 */
export function groupMissing(rows: readonly MissingLogoRow[], hasLogo: readonly boolean[]): MissingLogo[] {
  const by = new Map<string, MissingLogo>();
  rows.forEach((r, i) => {
    if (hasLogo[i] || isBankOwnMovement(r.description)) return;
    const keys = candidateKeys({ description: r.description });
    const key = keys.length > 1 ? keys[keys.length - 2] : keys[0];
    if (!key) return;
    const last = r.last ? new Date(r.last).toISOString().slice(0, 10) : null;
    const prev = by.get(key);
    if (prev) {
      prev.count += Number(r.n) || 0;
      prev.people = Math.max(prev.people, Number(r.people) || 0);
      if (last && (!prev.last || last > prev.last)) prev.last = last;
    } else {
      by.set(key, { name: businessLabel(r.description), sample: r.description.slice(0, 80), count: Number(r.n) || 0, people: Number(r.people) || 0, last });
    }
  });
  return [...by.values()].sort((a, b) => b.people - a.people || b.count - a.count || a.name.localeCompare(b.name)).slice(0, MISSING_LOGO_MAX);
}

/** The list for the admin, from the last MISSING_LOGO_DAYS days of bank movements. */
export async function merchantsWithoutLogo(db: Db): Promise<MissingLogo[]> {
  const rows = rowsOf<MissingLogoRow>(await db.execute(sql`
    SELECT merchantName, description, COUNT(*) AS n, COUNT(DISTINCT userId) AS people, MAX(transactionDate) AS last
    FROM bankTransactions
    WHERE importedFrom = 'plaid' AND type = 'expense' AND description IS NOT NULL AND description <> ''
      AND category NOT IN (${sql.join(NOT_A_BUSINESS.map((c) => sql`${c}`), sql`, `)})
      AND transactionDate >= DATE_SUB(CURDATE(), INTERVAL ${MISSING_LOGO_DAYS} DAY)
    GROUP BY merchantName, description
    ORDER BY n DESC
    LIMIT 2000`));
  const found = await withMerchantLogos(db, rows.map((r) => ({ merchantName: r.merchantName, description: r.description, logoUrl: null as string | null })));
  return groupMissing(rows, found.map((r) => !!r.logoUrl));
}
