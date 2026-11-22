// The app's logo: a blue column chart (the same shape as the Reportes icon). The color comes from the text
// color, blue by default; on dark backgrounds pass a lighter blue (e.g. "text-blue-400"). The favicon, the phone
// icon and the image in the emails are drawn from this same shape (public/favicon.svg, public/*.png).
import { cn } from "@/lib/utils";

export function Logo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-blue-600", className)}
      aria-hidden="true"
    >
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
