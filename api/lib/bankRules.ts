// Bills and payments the bank sync recognizes by name, before Plaid's own guess (api/bank-router.ts
// determineTypeAndCategory): paying a credit card, loans and buy-now-pay-later, rent, utilities and phone,
// health insurance, and government fees. Owner, 2026-11-24: card payments were showing as "Compras",
// Flex (rent) and Alabama Power as purchases, Upstart / Advance America / Affirm without their kind.
// Pure: the tests and any screen can use it.

export type KnownBill = "card_payment" | "loan" | "rent" | "health_insurance" | "utilities" | "government";

/** Paying a credit card: the issuer's name with a payment word, or the card's own "PAYMENT - THANK YOU". */
const CARD_ISSUER = /\b(?:capital ?one|cap ?one|discover|chase (?:card|credit|crd)|cardmember|citi ?cards?|citibank card|amex|american express|synchrony|syncb|sync bank|credit ?one|mission ?lane|merrick|milestone|indigo card|first premier|premier bankcard|barclay ?card|barclays|apple card|goldman sachs|gs bank|comenity|bread financial|total (?:visa|card)|aspire card|celtic bank|petal card|avant card|upgrade card|wells fargo card|bank of america card|boa card|card services?|credit card|crd)\b/;
const PAY_WORD = /\b(?:payments?|pymts?|pmts?|paymt|pay|autopay|auto pay|epay|e-?payment|bill ?pay|thank you)\b/;
// "PAYMENT - THANK YOU", "Payment Thank You-Mobile", "AUTOMATIC PAYMENT - THANK" (cut short by the bank).
const CARD_SIDE = /\b(?:payment|pymt|pmt)\s*-?\s*thank(?:\s*you)?\b|\bthank you for your payment\b/;

/** Loans, buy now pay later and cash advances. */
const LENDER = /\b(?:upstart|advance america|affirm|klarna|afterpay|after pay|sezzle|zip ?pay|quadpay|one ?main|onemain|speedy cash|check ?into ?cash|ace cash|cash ?america|lending ?club|oportun|mariner finance|world finance|world acceptance|regional finance|republic finance|security finance|lendmark|tower loan|1st franklin|first franklin|heights finance|net ?credit|opp ?loans|rise credit|cashnetusa|possible finance|earnin|brigit|dave inc|dave\.com|moneylion|klover|floatme|best egg|navient|nelnet|mohela|aidvantage|edfinancial|student loan|car loan|auto loan|credit acceptance|westlake|santander consumer|ally auto|exeter finance|gm financial|toyota (?:financial|motor credit)|honda financial|ford credit|nissan motor acc|hyundai motor fin|kia (?:motors )?fin|mortgage|rocket mortgage|mr ?cooper|loan (?:pmt|pymt|payment))\b/;

/** Rent: rent apps (Flex), property managers, apartments. */
const RENT = /\b(?:flex|getflex|flex rent|flex finance|flexible finance|rent|rent payment|rentpayment|rent ?pay|rent ?cafe|appfolio|yardi|buildium|bilt rent|zillow rent|cozy rent|avail rent|propertyware|rentec|apartments?|property management|prop mgmt|housing authority)\b/;

/** Renting a thing, not a home ("RENT-A-CENTER", car rentals): not rent. */
const NOT_RENT = /\b(?:rent[- ]?a[- ]?(?:center|car)|rental car|car rental|enterprise rent|budget rent|hertz|avis|u-?haul|turbo)\b/;

/** Health insurance premiums (other insurance stays "Seguro"). */
const HEALTH = /\b(?:blue ?cross|bcbs|blue shield|humana|aetna|cigna|united ?health(?:care)?|uhc|ambetter|oscar health|kaiser|anthem|molina|wellcare|viva health|healthcare\.gov|health ins|medical ins|dental ins|delta dental|guardian dental|metlife dental|vision ins|vsp vision|eyemed)\b/;

/** Power, gas, water, trash, phone, internet and TV. */
const UTILITY = /\b(?:alabama power|al power|southern company|georgia power|mississippi power|spire|alagasco|alabama gas|water ?works|water board|water service|water system|wtr|utilities|utility board|sewer|electric|power co|emc|electric coop(?:erative)?|tva|entergy|duke energy|propane|amerigas|ferrellgas|republic services|waste management|waste pro|garbage|trash|sanitation|at&t|att|verizon|vzw|t-?mobile|cricket|boost mobile|metro ?pcs|metro by t-?mobile|us cellular|consumer cellular|mint mobile|straight talk|tracfone|spectrum|charter comm(?:unications)?|xfinity|comcast|cox comm|mediacom|wow internet|windstream|brightspeed|centurylink|frontier comm(?:unications)?|directv|dish network|sling tv|starlink|hughesnet|viasat)\b/;

/** Government: business filings, taxes, tags and licenses, courts (no seals or logos for these). */
const GOVERNMENT = /\b(?:secretary of state|sec of state|al sos|alabama sos|sos alabama|dept of revenue|department of revenue|dept of rev|ala dept rev|aldor|my alabama taxes|alabama dor|irs|usataxpymt|us treasury|tax collector|revenue commissioner|license commissioner|probate|county tag|tag office|dmv|alea|driver license|city of|town of|county of|municipal court|court costs|clerk of court|state of alabama|federal tax|state tax)\b/;

/**
 * The kind of bill a bank movement is, by its text and Plaid's detailed category, or null. `plaidAmount` > 0 is
 * money out. Government is only for money out (a tax refund coming in is income).
 */
export function knownBill(description: string, plaidDetailed: string | null | undefined, plaidAmount: number): KnownBill | null {
  const d = ` ${(description ?? "").toLowerCase().replace(/\s+/g, " ")} `;
  const detailed = (plaidDetailed ?? "").toUpperCase();
  if (detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" || CARD_SIDE.test(d) || (CARD_ISSUER.test(d) && PAY_WORD.test(d))) return "card_payment";
  if (LENDER.test(d)) return "loan";
  // Utilities before rent ("CITY OF X WATER" is water; "RENT" inside a power bill isn't rent).
  if (UTILITY.test(d)) return "utilities";
  if (HEALTH.test(d)) return "health_insurance";
  if (RENT.test(d) && !NOT_RENT.test(d)) return "rent";
  if (plaidAmount > 0 && GOVERNMENT.test(d)) return "government";
  return null;
}

/**
 * Plaid's own detailed category, when the name says nothing: rent, utilities (power, gas, water, phone,
 * internet...), card payments and other loans, health insurance among insurance, and government fees.
 */
export function billFromPlaid(plaidDetailed: string | null | undefined, description: string, plaidAmount: number): KnownBill | null {
  const detailed = (plaidDetailed ?? "").toUpperCase();
  if (!detailed) return null;
  if (detailed === "RENT_AND_UTILITIES_RENT") return "rent";
  if (detailed.startsWith("RENT_AND_UTILITIES")) return "utilities";
  if (detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return "card_payment";
  if (detailed.startsWith("LOAN_PAYMENTS")) return "loan";
  if (detailed === "GENERAL_SERVICES_INSURANCE" && HEALTH.test(` ${description.toLowerCase()} `)) return "health_insurance";
  if (detailed.startsWith("GOVERNMENT_AND_NON_PROFIT") && !detailed.includes("DONATIONS") && plaidAmount > 0) return "government";
  return null;
}

/** Bank categories that move money between your own accounts or debts: never spending, never income. */
export const NOT_SPENT_NOR_EARNED: ReadonlySet<string> = new Set(["transfer", "transfer_income", "card_payment"]);

/**
 * Car washes (owner, 2026-11-24): what people pay there is a membership (unlimited washes every month), so they go
 * under "Suscripciones y membresías". The chains by name (their bank text doesn't always say "car wash") and the
 * generic words.
 */
const CAR_WASH = new RegExp([
  String.raw`\b(?:car ?wash(?:es)?|carwash|auto ?wash|auto ?spa|express ?wash|tunnel ?wash|wash ?club|wash ?shack)\b`,
  // Chains whose bank text may not say "car wash": Marc-1 (Alabama, MOJO), Mister (MCW), Quick Quack, ZIPS (not
  // its dry cleaners), Tommy's, Whistle, ModWash, Autobell, Rocket, Jet Brite, Hurricane, Tidal Wave, Goo-Goo, Moo Moo…
  String.raw`\b(?:marc ?-? ?1|marc1|mark ?-? ?1 car|mcw|quick ?quack|dontdrivedirty|zips (?:car|express)|tommy'?s express|whistle express|mod ?wash|autobell|rocket express|jet ?brite|hurricane express|tidal wave|goo ?-?goo|moo ?moo|white ?water express|tsunami express|delta ?sonic)\b`,
  String.raw`\bzips ?#? ?\d`,
].join("|"));

export function isCarWash(text: string | null | undefined): boolean {
  return CAR_WASH.test(` ${(text ?? "").toLowerCase().replace(/\s+/g, " ")} `);
}
