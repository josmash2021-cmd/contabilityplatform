/**
 * True when a database error (or the error it wraps — drizzle wraps mysql2's) means the
 * table doesn't exist yet. Features create their tables on first use, so cleanups that run
 * before then (e.g. deleting an account) can treat that as "nothing to delete".
 */
export function isMissingTable(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; depth++) {
    const err = cur as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (err.code === "ER_NO_SUCH_TABLE" || err.errno === 1146) return true;
    if (typeof err.message === "string" && /doesn't exist|ER_NO_SUCH_TABLE/i.test(err.message)) return true;
    cur = err.cause;
  }
  return false;
}

/** True when a database error (or the one it wraps) is a duplicate key, e.g. a number already taken. */
export function isDuplicateKey(e: unknown): boolean {
  for (let cur: unknown = e, depth = 0; cur && depth < 5; depth++) {
    const err = cur as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) return true;
    if (typeof err.message === "string" && /Duplicate entry|ER_DUP_ENTRY/i.test(err.message)) return true;
    cur = err.cause;
  }
  return false;
}
