// The logo rules the page shares with the server (api/settings-router.ts: LOGO_MAX_BYTES and LOGO_TYPES).
// Pure: no browser APIs, so the tests can load it.
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
/** Longest side, in pixels, when a logo has to be made smaller. Plenty for a document header. */
export const LOGO_MAX_SIDE = 800;

export type LogoError = "type" | "tooBig" | "read";
export class LogoPrepError extends Error {
  readonly reason: LogoError;
  constructor(reason: LogoError) {
    super(reason);
    this.reason = reason;
  }
}

export function isLogoType(type: string): type is (typeof LOGO_TYPES)[number] {
  return (LOGO_TYPES as readonly string[]).includes(type);
}

/** The size that fits inside `max`×`max` keeping the shape (never larger than the original). */
export function fitInside(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
