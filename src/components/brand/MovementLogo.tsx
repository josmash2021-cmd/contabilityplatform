import { BankLogo } from "./BankLogo";
import { MerchantLogo } from "./MerchantLogo";
import { useInstitutionOf } from "./useInstitutionOf";

type Props = {
  /** The merchant's name (the monogram's letter when there's no logo at all). */
  name: string;
  /** Plaid's logo for the merchant, when it has one. */
  logoUrl?: string | null;
  /** The bank account the money went through: its bank's original logo stands in when the merchant has none. */
  accountId?: number | null;
  size?: number;
  className?: string;
};

/**
 * The logo of a bank movement: the merchant's original logo, else the original logo of the bank it went
 * through (a bank's own movements, like a fee or a provisional credit, have no merchant), else a monogram.
 */
export function MovementLogo({ name, logoUrl, accountId, size = 32, className }: Props) {
  const institutionOf = useInstitutionOf(accountId !== null && accountId !== undefined);
  const bank = institutionOf(accountId);
  const fallback = bank ? <BankLogo name={bank.name} logo={bank.logo} color={bank.color} size={size} className={className} /> : undefined;
  return <MerchantLogo name={name} logoUrl={logoUrl} size={size} className={className} fallback={fallback} />;
}
