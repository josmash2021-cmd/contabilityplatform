// Por revisar: turns the server's facts (api/lib/reviewEngine.ts `Why`, `Match`) into the plain words shown
// under each movement, in the reader's language.
import type { MovimientosCopy } from "@/i18n/copy/movimientos";
import type { Match, Why } from "../../../api/lib/reviewEngine";
import { accountLabel, categoryLabel, dayLabel, money } from "./shared";

/** What review.list returns per movement (kept loose so the page compiles against the inferred API type). */
export type ReviewItemView = {
  id: number;
  date: string;
  description: string;
  who: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  storedCategory: string;
  bankAccountId: number | null;
  bankName: string | null;
  accountNumber: string | null;
  logoUrl: string | null;
  merchantName: string | null;
  plaidAmount: string | null;
  importedFrom: string | null;
  rulePattern: string;
  hasRule: boolean;
  cashDeposit: boolean;
  transferPair: number | null;
  duplicateOf: number | null;
  match: Match | null;
  kind: "match" | "ready" | "ask";
  ask: "bizpersonal" | "split" | "duplicate" | null;
  conf: "high" | "mid";
  why: Why;
};

export type AccountNames = Record<string, string>;

const otherAcct = (id: number, names: AccountNames, t: MovimientosCopy) => names[String(id)] || t.rv.otherAccount;

/** The bold name of a row: transfers and cash deposits say what they are. */
export function whoOf(item: ReviewItemView, names: AccountNames, t: MovimientosCopy): string {
  if (item.why.code === "transfer") {
    const acct = otherAcct(item.why.otherAccountId, names, t);
    return item.why.direction === "to" ? t.rv.transferTo(acct) : t.rv.transferFrom(acct);
  }
  if (item.cashDeposit) return t.rv.cashDeposit;
  return item.who || item.description;
}

/** The chip for a match ("Factura #1038 de Carlos Ruiz"). */
export function matchLabel(match: Match, t: MovimientosCopy, locale: string): string {
  if (match.type === "sale") return t.rv.matchSale(match.invoiceNumber, match.customerName);
  if (match.type === "cash") return t.rv.matchCash(match.saleIds.length, dayLabel(match.day, locale));
  return t.rv.matchBill(match.vendorName);
}

/** The category chip text: transfers say "Entre tus cuentas". */
export function suggestionLabel(item: ReviewItemView, category: string, t: MovimientosCopy): string {
  if (item.why.code === "transfer") return t.rv.betweenAccounts;
  return categoryLabel(category, t);
}

/** The "why" line, from real facts only. */
export function whyText(item: ReviewItemView, t: MovimientosCopy, locale: string, names: AccountNames): string {
  const w = t.rv.why;
  const why = item.why;
  switch (why.code) {
    case "rule": return w.rule(why.pattern, categoryLabel(why.category, t));
    case "history": return w.history(why.n);
    case "historyMixed": return why.total === 1 ? w.historyOnce : w.historyMixed(why.n, why.total);
    case "keyword": return item.type === "income" ? w.keywordIn : w.keyword;
    case "transfer": {
      const acct = otherAcct(why.otherAccountId, names, t);
      const day = dayLabel(why.date, locale);
      return why.direction === "to" ? w.transferTo(acct, day) : w.transferFrom(acct, day);
    }
    case "duplicate": return w.duplicate(dayLabel(why.date, locale));
    case "bizpersonal": return w.bizpersonal;
    case "split": return w.split;
    case "matchSale": return why.byName ? w.saleByName(why.invoiceNumber) : w.saleByAmount(why.invoiceNumber, why.customer);
    case "matchCash": {
      const shown = why.amounts.slice(0, 4).map((a) => money(a)).join(" + ");
      return w.cash(why.amounts.length > 4 ? `${shown} + …` : shown);
    }
    case "matchBill": return w.bill(dayLabel(why.due, locale));
  }
}

/** "Chase ••4410" for a row. */
export const rowAccount = (item: { bankName: string | null; accountNumber: string | null }, t: MovimientosCopy) => accountLabel(item.bankName, item.accountNumber, t);
