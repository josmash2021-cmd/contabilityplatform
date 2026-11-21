// Logos for the personal movements and accounts: the original from Plaid (src/components/brand), never drawn here.
import { MerchantLogo } from "@/components/brand/MerchantLogo";
import { BankLogo } from "@/components/brand/BankLogo";
import { useInstitutionOf } from "@/components/brand/useInstitutionOf";
import { isBankOwnMovement } from "../../../api/lib/brand";
import { cn } from "@/lib/utils";
import { styleOf } from "./personalUtils";
import type { Institution, TxRow } from "./txKit";

/**
 * The movement's original logo (Plaid's merchant logo); a movement of the bank itself (a provisional credit,
 * a fee) shows its bank's logo; anything else without one, its category icon in a soft circle.
 */
export function TxLogo({ row, size = 36 }: { row: Pick<TxRow, "name" | "logoUrl" | "category" | "type"> & Partial<Pick<TxRow, "raw" | "accountId">>; size?: number }) {
  const { icon: Icon } = styleOf(row.category, row.type);
  const inc = row.type === "income";
  const own = row.accountId !== null && row.accountId !== undefined && isBankOwnMovement(`${row.raw ?? ""} ${row.name}`);
  const bank = useInstitutionOf(own)(own ? row.accountId : null);
  const fallback = bank ? <BankLogo name={bank.name} logo={bank.logo} color={bank.color} size={size} /> : (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-full", inc ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-700")} style={{ width: size, height: size }}>
      <Icon style={{ width: Math.round(size * 0.46), height: Math.round(size * 0.46) }} />
    </span>
  );
  return <MerchantLogo name={row.name} logoUrl={row.logoUrl} size={size} fallback={fallback} />;
}

/** A bank account's logo: its institution's (brand.institutions), else the bundled original or a monogram. */
export function AccountLogo({ inst, fallbackName, size = 36 }: { inst: Institution | null; fallbackName: string; size?: number }) {
  return <BankLogo name={inst?.name || fallbackName} logo={inst?.logo ?? null} color={inst?.color ?? null} size={size} />;
}

