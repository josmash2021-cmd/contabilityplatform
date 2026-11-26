// After a refresh changed the bank's numbers (a balance from the bank itself, owner 2026-11-26: "se ve dinero
// viejo"), the screen reads them again. On arrival the screen's first reads go out at the same moment as the
// refresh, so they can still be on their way with the numbers from before it; React Query would hand back that
// same older answer instead of reading again. Cancel them first, then read again.

/** One of tRPC's utils entries (utils.banks.overview, utils.brand.institutions...). */
type Readable = { cancel: () => Promise<void>; invalidate: () => Promise<void> };

export async function readAgain(...queries: Readable[]): Promise<void> {
  await Promise.all(queries.map((q) => q.cancel().catch(() => undefined)));
  await Promise.all(queries.map((q) => q.invalidate().catch(() => undefined)));
}
