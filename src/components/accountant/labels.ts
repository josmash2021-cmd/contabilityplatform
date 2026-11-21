// Expense categories are stored as keys ("supplies", "vendors"…). On screen and in the PDF they
// read in the user's language; unknown or free-text categories show as they were typed.
import type { AccountantCopy } from "@/i18n/copy/accountant";
import type { ReceiptsCopy } from "@/i18n/copy/receipts";

export function expenseCategoryLabel(key: string, c: AccountantCopy, r: ReceiptsCopy): string {
  const k = key.trim();
  if (!k) return c.uncategorized;
  if (k === "vendors") return c.ui.vendorsCategory;
  return (r.categories as Record<string, string>)[k] ?? k;
}
