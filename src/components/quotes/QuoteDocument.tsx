import type { ReactNode } from "react";
import { createPortal } from "react-dom";

// While it's mounted, printing shows only its content (the rest of the app is hidden on paper).
// The quote and invoice documents themselves are drawn by src/components/invoices/DocPreview.tsx.
const PRINT_CSS = `
.quote-print-root { display: none; }
@media print {
  @page { margin: 14mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(.quote-print-root) { display: none !important; }
  .quote-print-root { display: block !important; }
}
`;

/** Puts its children straight under <body>, visible only when printing. */
export function PrintPortal({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="quote-print-root">
      <style>{PRINT_CSS}</style>
      {children}
    </div>,
    document.body,
  );
}
