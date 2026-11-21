import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { monogram, safeLogoUrl } from "../../../api/lib/brand";

export type MerchantLogoProps = {
  /** The merchant's name ("Home Depot"); also the monogram's letter. */
  name: string;
  /** Plaid's logo for the merchant (bank rows' `logoUrl`). */
  logoUrl?: string | null;
  /** Width and height in px (default 36). */
  size?: number;
  /**
   * Optional: what to show when there's no real logo (or it fails to load), e.g. the row's existing
   * category icon, sized to `size`. Without it, a neutral monogram.
   */
  fallback?: ReactNode;
  className?: string;
};

/**
 * A merchant's ORIGINAL logo, as Plaid sends it with the bank movement. Loads lazily and falls back
 * cleanly (to `fallback`, else a neutral monogram) when there's no logo or it can't load. Never draws a
 * brand mark of its own.
 */
export function MerchantLogo({ name, logoUrl, size = 36, fallback, className }: MerchantLogoProps) {
  const src = safeLogoUrl(logoUrl);
  // The URL that failed to load, if any (a new logoUrl gets its own chance).
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const radius = Math.max(4, Math.round(size * 0.24));

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt=""
        title={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        onError={() => setFailedSrc(src)}
        className={cn("shrink-0 select-none border border-slate-200 bg-white object-contain", className)}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  if (fallback) return <>{fallback}</>;

  return (
    <span
      aria-hidden="true"
      title={name}
      className={cn("inline-grid shrink-0 select-none place-items-center bg-slate-100 font-bold leading-none text-slate-700", className)}
      style={{ width: size, height: size, borderRadius: radius, fontSize: Math.max(10, Math.round(size * 0.42)) }}
    >
      {monogram(name)}
    </span>
  );
}
