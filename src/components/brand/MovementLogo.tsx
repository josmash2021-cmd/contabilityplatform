import { BankLogo } from "./BankLogo";
import { MerchantLogo } from "./MerchantLogo";
import { useInstitutionOf } from "./useInstitutionOf";

type Props = {
  /** The merchant's name (the monogram's letter when there's no logo at all). */
  name: string;
  /** Plaid's logo for the merchant, when it has one. */
  logoUrl?: string | null;
  /** The bank account the money went through. */
  accountId?: number | null;
  /** Made by the bank itself (isBankOwnMovement: a provisional credit, a fee): it shows that bank's logo. */
  bankOwn?: boolean;
  size?: number;
  className?: string;
};

/**
 * The logo of a bank movement: the merchant's original logo; a movement of the bank itself (a provisional
 * credit, a fee) shows its bank's original logo; anything else without a logo (a Zelle, a local business)
 * keeps its monogram.
 */
export function MovementLogo({ name, logoUrl, accountId, bankOwn = false, size = 32, className }: Props) {
  const institutionOf = useInstitutionOf(bankOwn && accountId !== null && accountId !== undefined);
  const bank = bankOwn ? institutionOf(accountId) : null;
  const fallback = bank ? <BankLogo name={bank.name} logo={bank.logo} color={bank.color} size={size} className={className} /> : undefined;
  return <MerchantLogo name={name} logoUrl={logoUrl} size={size} className={className} fallback={fallback} />;
}
