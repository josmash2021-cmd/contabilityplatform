import { useState } from "react";
import { cn } from "@/lib/utils";
import { bundledBankLogo, monogram, monogramColors } from "../../../api/lib/brand";

export type BankLogoProps = {
  /** The institution's name ("Wells Fargo"). Also picks the bundled original and the monogram letter. */
  name: string;
  /** Plaid's institution logo as a data URL (brand.institutions → logo). */
  logo?: string | null;
  /** Plaid's primary color for the institution ("#D71E28"), used only to tint the monogram. */
  color?: string | null;
  /** Width and height in px (default 36). */
  size?: number;
  className?: string;
};

/**
 * A bank's ORIGINAL logo: Plaid's institution logo first, then a bundled original from
 * public/brands/banks/ (Chase, Bank of America, Wells Fargo), else a neutral monogram (the initial on a
 * soft tint of the bank's color, or slate). Never draws a brand mark of its own.
 * Rounded square on white with a thin border, like the 2.0 prototype's bankLogo().
 */
export function BankLogo({ name, logo, color, size = 36, className }: BankLogoProps) {
  const bundled = bundledBankLogo(name);
  const sources: Array<{ src: string; pad: number }> = [];
  // The bank's current logo saved with the app first (Plaid's can be an older version), then Plaid's.
  if (bundled) sources.push(bundled);
  if (logo && /^data:image\/(png|jpeg|gif|webp);base64,/.test(logo)) sources.push({ src: logo, pad: 0.1 });
  // Images that failed to load (kept per source, so a new logo prop gets its own chance).
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const pick = sources.find((s) => !failed.has(s.src));
  const radius = Math.max(4, Math.round(size * 0.24));
  const box = { width: size, height: size, borderRadius: radius };

  if (pick) {
    return (
      <img
        src={pick.src}
        alt=""
        title={name}
        width={size}
        height={size}
        decoding="async"
        draggable={false}
        onError={() => setFailed((prev) => new Set(prev).add(pick.src))}
        className={cn("shrink-0 select-none border border-slate-200 bg-white object-contain", className)}
        style={{ ...box, padding: Math.round(size * pick.pad) }}
      />
    );
  }

  const tone = monogramColors(color);
  return (
    <span
      aria-hidden="true"
      title={name}
      className={cn("inline-grid shrink-0 select-none place-items-center border border-slate-200 font-bold leading-none", className)}
      style={{ ...box, background: tone.bg, color: tone.fg, fontSize: Math.max(10, Math.round(size * 0.44)) }}
    >
      {monogram(name)}
    </span>
  );
}
