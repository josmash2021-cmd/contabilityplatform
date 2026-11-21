import { CategoryDetailView } from "@/components/bankDetail/CategoryDetailView";
import { useCopy } from "@/i18n/useI18n";
import { personalCopy } from "@/i18n/copy/personal";

/** /personal/category/:category — one category across all the person's accounts. */
export default function PersonalCategoryDetail() {
  const { categories } = useCopy(personalCopy);
  return (
    <CategoryDetailView
      mode="personal"
      labels={{ income: categories.income, expense: categories.expense }}
      fallback={() => "/personal"}
    />
  );
}
