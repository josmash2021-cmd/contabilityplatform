import { CategoryDetailView } from "@/components/bankDetail/CategoryDetailView";
import { useCopy } from "@/i18n/useI18n";
import { bankCopy } from "@/i18n/copy/bank";

/** /bank/category/:category — the business bank's drill-down into one category. */
export default function BankCategoryDetail() {
  const { categories } = useCopy(bankCopy);
  return (
    <CategoryDetailView
      mode="business"
      labels={{ income: categories, expense: categories }}
      accountKey="bank_selected_account_id"
      fallback={(month, year) => `/bank?month=${month}&year=${year}`}
    />
  );
}
