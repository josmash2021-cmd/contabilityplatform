// ── Bank connections (Plaid items): institution name, original logo, color and health ──
// Filled at connect time (bank.exchangePublicToken), lazily for older connections (brand.institutions,
// logos refreshed at most once a week), and the health is recorded from the real outcome of the Plaid calls
// the bank screens make (sync, balances, month data).
import { and, eq } from "drizzle-orm";
import type { getDb } from "../queries/connection";
import { bankAccounts } from "@db/schema";
import { institutionLogoDataUrl, normalizeColor, plaidErrorCode, statusForError, type InstitutionStatus } from "./brand";
import { bankInstitutionsTable, type BankInstitutionRow } from "./brandSchema";
import { ensureBrandTables } from "./brandTables";
import { plaidWebhookUrl } from "./plaidWebhook";

type Db = ReturnType<typeof getDb>;

/** The subset of the Plaid SDK client used here (the SDK object is untyped where the app creates it). */
export type PlaidLike = {
  itemGet(req: { access_token: string }): Promise<{ data: {
    item: { item_id?: string; institution_id?: string | null; webhook?: string | null; error?: { error_code?: string | null } | null };
    /** When Plaid last brought the bank's movements (and with them its balances). */
    status?: { transactions?: { last_successful_update?: string | null } | null } | null;
  } }>;
  /** Tells Plaid where to post this connection's webhooks (api/lib/plaidWebhook.ts). */
  itemWebhookUpdate?(req: { access_token: string; webhook: string }): Promise<unknown>;
  institutionsGetById(req: { institution_id: string; country_codes: string[]; options?: { include_optional_metadata?: boolean } }): Promise<{
    data: { institution: { institution_id?: string; name?: string | null; logo?: string | null; primary_color?: string | null } };
  }>;
};

/** What brand.institutions returns for each bank connection (the contract in the 2.0 brief). */
export type Institution = {
  itemId: string;
  institutionId: string | null;
  name: string;
  logo: string | null;
  color: string | null;
  accountIds: number[];
  status: InstitutionStatus;
  errorCode: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  /** When Plaid last brought this bank's data: what the screens show as "Lo último de tu banco" (null: not known yet). */
  bankUpdatedAt: string | null;
  /** When the balance last came from the bank itself (Plaid Balance, api/lib/liveBalance.ts); null: never. */
  liveBalanceAt: string | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** A connection no bank screen touched for this long gets its health checked with Plaid's /item/get. */
const STATUS_STALE_MS = 12 * 60 * 60 * 1000;
/** A connection with a problem is checked sooner, so it shows "ok" soon after the owner reconnects it. */
const PROBLEM_STALE_MS = 10 * 60 * 1000;
/** After a failed attempt, don't ask Plaid again for the same item sooner than this. */
const RETRY_MS = 10 * 60 * 1000;
const PLAID_TIMEOUT_MS = 6000;

const failedAt = new Map<string, number>();
const lastWrite = new Map<string, { what: string; at: number }>();

function timeout<T>(p: Promise<T>, ms = PLAID_TIMEOUT_MS): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Plaid timeout")), ms))]);
}

/** A stable id for a group of accounts that share one access token, when the row has no plaidItemId (old rows). */
export function itemKeyOf(accounts: ReadonlyArray<{ id: number; plaidItemId?: string | null; plaidAccessToken?: string | null }>, account: { id: number; plaidItemId?: string | null; plaidAccessToken?: string | null }): string | null {
  if (account.plaidItemId) return account.plaidItemId;
  if (!account.plaidAccessToken) return null;
  const ids = accounts.filter((a) => a.plaidAccessToken === account.plaidAccessToken).map((a) => Number(a.id));
  return `account-${Math.min(Number(account.id), ...ids)}`;
}

/**
 * Records how a Plaid call for this connection went: success, or Plaid's error (ITEM_LOGIN_REQUIRED →
 * needs_reconnect). Errors without a Plaid code (our own timeouts) and neutral ones are not recorded.
 * Best effort: never throws, so it can't break the bank screens.
 */
export async function recordItemOutcome(
  db: Db, userId: number, itemId: string | null | undefined,
  outcome: { ok: true } | { error: unknown } | { errorCode: string },
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!itemId) return;
  try {
    const code = "ok" in outcome ? null : "errorCode" in outcome ? outcome.errorCode : plaidErrorCode(outcome.error);
    const status: InstitutionStatus | null = "ok" in outcome ? "ok" : statusForError(code);
    if (!status) return;
    // The same answer again within a minute isn't worth another write.
    const k = `${userId}:${itemId}`;
    const what = `${status}:${code ?? ""}`;
    const prev = lastWrite.get(k);
    if (!opts.force && prev && prev.what === what && Date.now() - prev.at < 60_000) return;
    await ensureBrandTables(db);
    const now = new Date();
    if (status === "ok") {
      await db.insert(bankInstitutionsTable).values({ userId, itemId, name: "", status, errorCode: null, lastSuccessAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { status, errorCode: null, lastSuccessAt: now, updatedAt: now } });
    } else {
      await db.insert(bankInstitutionsTable).values({ userId, itemId, name: "", status, errorCode: code, lastErrorAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { status, errorCode: code, lastErrorAt: now, updatedAt: now } });
    }
    lastWrite.set(k, { what, at: Date.now() });
  } catch (e: unknown) {
    console.error("[institutions] status not saved:", e instanceof Error ? e.message : e);
  }
}

/** Runs one Plaid call for a connection and records how it went (recordItemOutcome). Errors are rethrown. */
export async function trackPlaid<T>(db: Db, userId: number, itemId: string | null | undefined, call: () => Promise<T>): Promise<T> {
  let result: T;
  try {
    result = await call();
  } catch (e: unknown) {
    await recordItemOutcome(db, userId, itemId, { error: e });
    throw e;
  }
  await recordItemOutcome(db, userId, itemId, { ok: true });
  return result;
}

/**
 * Asks Plaid for the item's institution (name, logo, color) and its current error, then saves both.
 * Best effort: returns false when Plaid or the database fails.
 */
export async function refreshInstitution(db: Db, client: PlaidLike, userId: number, itemKey: string, accessToken: string, opts: { meta: boolean } = { meta: true }): Promise<boolean> {
  const k = `${userId}:${itemKey}`;
  failedAt.set(k, Date.now());
  let got: Awaited<ReturnType<PlaidLike["itemGet"]>>["data"];
  try {
    got = (await timeout(client.itemGet({ access_token: accessToken }))).data;
  } catch (e: unknown) {
    await recordItemOutcome(db, userId, itemKey, { error: e }, { force: true });
    return false;
  }
  const item = got.item;
  const itemError = item.error?.error_code ?? null;
  await recordItemOutcome(db, userId, itemKey, itemError ? { errorCode: itemError } : { ok: true }, { force: true });
  await saveBankFreshness(db, client, userId, itemKey, accessToken, got.status?.transactions?.last_successful_update ?? null, item.webhook ?? null);
  if (!opts.meta || !item.institution_id) { failedAt.delete(k); return true; }
  try {
    const inst = (await timeout(client.institutionsGetById({
      institution_id: item.institution_id,
      country_codes: ["US"],
      options: { include_optional_metadata: true },
    }))).data.institution;
    await saveInstitutionMeta(db, userId, itemKey, {
      institutionId: item.institution_id,
      name: inst.name ?? "",
      logo: institutionLogoDataUrl(inst.logo),
      color: normalizeColor(inst.primary_color),
    });
    failedAt.delete(k);
    return true;
  } catch (e: unknown) {
    console.error("[institutions] metadata not loaded:", e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * When Plaid last brought this bank's data (saved for the screens), and the webhook: when Plaid doesn't have the
 * app's address for this connection yet (connections made before webhooks), it's set once (/item/webhook/update).
 * Best effort: never throws.
 */
async function saveBankFreshness(db: Db, client: PlaidLike, userId: number, itemKey: string, accessToken: string, lastUpdate: string | null, webhook: string | null): Promise<void> {
  try {
    const at = lastUpdate ? new Date(lastUpdate) : null;
    const want = plaidWebhookUrl();
    let hook = webhook;
    if (want && client.itemWebhookUpdate && (webhook ?? "") !== want) {
      try {
        await timeout(client.itemWebhookUpdate({ access_token: accessToken, webhook: want }));
        hook = want;
        console.log(`[institutions] webhook set for bank ${itemKey} (user ${userId})`);
      } catch (e: unknown) {
        console.error(`[institutions] webhook not set for bank ${itemKey}:`, plaidErrorCode(e) ?? (e instanceof Error ? e.message : e));
      }
    }
    const set: Partial<BankInstitutionRow> = { webhook: hook ? hook.slice(0, 255) : null };
    if (at && !Number.isNaN(at.getTime())) set.bankUpdatedAt = at;
    await db.update(bankInstitutionsTable).set(set).where(and(eq(bankInstitutionsTable.userId, userId), eq(bankInstitutionsTable.itemId, itemKey)));
  } catch (e: unknown) {
    console.error("[institutions] bank time not saved:", e instanceof Error ? e.message : e);
  }
}

/** Saves the institution's name, logo and color for a connection (keeps an older logo if Plaid sent none). */
export async function saveInstitutionMeta(db: Db, userId: number, itemId: string, meta: { institutionId: string | null; name: string; logo: string | null; color: string | null }): Promise<void> {
  await ensureBrandTables(db);
  const now = new Date();
  const name = meta.name.normalize("NFC").trim().slice(0, 255);
  const set: Partial<BankInstitutionRow> = { institutionId: meta.institutionId, metaFetchedAt: now, updatedAt: now };
  if (name) set.name = name;
  if (meta.logo) set.logo = meta.logo;
  if (meta.color) set.color = meta.color;
  await db.insert(bankInstitutionsTable)
    .values({ userId, itemId, institutionId: meta.institutionId, name, logo: meta.logo, color: meta.color, metaFetchedAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set });
}

type AccountRow = { id: number; plaidItemId: string | null; plaidAccessToken: string | null; bankName: string; isActive: boolean | null };

const iso = (d: Date | string | null | undefined) => {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};
const asStatus = (s: string | null | undefined): InstitutionStatus => (s === "needs_reconnect" || s === "error" ? s : "ok");

/**
 * The user's bank connections with their institution's original logo and health. Fills what's missing
 * (connections made before this existed) and refreshes logos once a week; checks with Plaid the health of a
 * connection no bank screen touched in 12 hours. Only this user's accounts are read.
 */
export async function listInstitutions(db: Db, client: PlaidLike | null, userId: number): Promise<Institution[]> {
  const accounts: AccountRow[] = await db.select({
    id: bankAccounts.id, plaidItemId: bankAccounts.plaidItemId, plaidAccessToken: bankAccounts.plaidAccessToken,
    bankName: bankAccounts.bankName, isActive: bankAccounts.isActive,
  }).from(bankAccounts).where(eq(bankAccounts.userId, userId));
  // Same rule as bank.listAccounts: connected (has a token) and active.
  const active = accounts.filter((a) => a.plaidAccessToken && a.isActive).sort((a, b) => Number(a.id) - Number(b.id));
  if (active.length === 0) return [];

  const groups = new Map<string, { token: string; accounts: AccountRow[] }>();
  for (const a of active) {
    const key = itemKeyOf(active, a);
    if (!key || !a.plaidAccessToken) continue;
    const g = groups.get(key);
    if (g) g.accounts.push(a);
    else groups.set(key, { token: a.plaidAccessToken, accounts: [a] });
  }

  await ensureBrandTables(db);
  const load = async (): Promise<BankInstitutionRow[]> => db.select().from(bankInstitutionsTable).where(eq(bankInstitutionsTable.userId, userId));
  let rows = await load();

  if (client) {
    const now = Date.now();
    const jobs: Array<Promise<boolean>> = [];
    for (const [key, g] of groups) {
      const row = rows.find((r) => r.itemId === key);
      const fetchedAt = row?.metaFetchedAt ? new Date(row.metaFetchedAt).getTime() : 0;
      const needMeta = !row || !row.name || !fetchedAt || now - fetchedAt > WEEK_MS;
      const touched = Math.max(row?.lastSuccessAt ? new Date(row.lastSuccessAt).getTime() : 0, row?.lastErrorAt ? new Date(row.lastErrorAt).getTime() : 0);
      const needStatus = now - touched > (row && row.status !== "ok" ? PROBLEM_STALE_MS : STATUS_STALE_MS);
      const failed = failedAt.get(`${userId}:${key}`) ?? 0;
      if ((needMeta || needStatus) && now - failed > RETRY_MS) jobs.push(refreshInstitution(db, client, userId, key, g.token, { meta: needMeta }));
    }
    if (jobs.length > 0) {
      await Promise.all(jobs);
      rows = await load();
    }
  }

  const out: Institution[] = [];
  for (const [key, g] of groups) {
    const row = rows.find((r) => r.itemId === key);
    out.push({
      itemId: key,
      institutionId: row?.institutionId ?? null,
      name: row?.name || g.accounts[0].bankName || "",
      logo: row?.logo ?? null,
      color: row?.color ?? null,
      accountIds: g.accounts.map((a) => Number(a.id)),
      status: asStatus(row?.status),
      errorCode: row?.errorCode ?? null,
      lastSuccessAt: iso(row?.lastSuccessAt),
      lastErrorAt: iso(row?.lastErrorAt),
      bankUpdatedAt: iso(row?.bankUpdatedAt),
      liveBalanceAt: iso(row?.liveBalanceAt),
    });
  }
  return out;
}

/** Forgets the user's connections (bank.disconnect). Best effort. */
export async function forgetInstitutions(db: Db, userId: number, itemId?: string): Promise<void> {
  for (const k of [...lastWrite.keys()]) if (k.startsWith(`${userId}:`) && (!itemId || k === `${userId}:${itemId}`)) lastWrite.delete(k);
  try {
    await ensureBrandTables(db);
    await db.delete(bankInstitutionsTable).where(itemId ? and(eq(bankInstitutionsTable.userId, userId), eq(bankInstitutionsTable.itemId, itemId)) : eq(bankInstitutionsTable.userId, userId));
  } catch (e: unknown) {
    console.error("[institutions] cleanup failed:", e instanceof Error ? e.message : e);
  }
}
