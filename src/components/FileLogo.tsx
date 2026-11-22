// The modern Excel and PDF logos (public/brands/files), wherever the app or the site shows one of those files.
// Decorative: the text next to it always says "Excel" or "PDF".
export function FileLogo({ kind, className = "h-5 w-5" }: { kind: "excel" | "pdf"; className?: string }) {
  return <img src={`/brands/files/${kind}.svg`} alt="" aria-hidden="true" draggable={false} className={`shrink-0 select-none ${className}`} />;
}
