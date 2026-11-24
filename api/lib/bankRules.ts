// Bills and payments the bank sync recognizes by name, before Plaid's own guess (api/bank-router.ts
// determineTypeAndCategory): paying a credit card, loans and buy-now-pay-later, rent, utilities and phone,
// health insurance, and government fees. Owner, 2026-11-24: card payments were showing as "Compras",
// Flex (rent) and Alabama Power as purchases, Upstart / Advance America / Affirm without their kind.
// Pure: the tests and any screen can use it.

export type KnownBill = "card_payment" | "loan" | "rent" | "health_insurance" | "utilities" | "government" | "car_insurance" | "donations" | "remittance";

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

/** Car insurance (owner, 2026-11-24: apart from health insurance). Alfa, State Farm and the like also sell home
 * insurance: most people pay them for the car, and a person who pays one for the house changes it once (history). */
const CAR_INSURANCE = /\b(?:geico|progressive|state ?farm|allstate|alfa (?:ins|insurance|mutual|auto)|alfa2go|liberty mutual|farmers ins(?:urance)?|nationwide|usaa|travelers ins|the general|root ins(?:urance)?|direct auto|dairyland|infinity (?:auto|ins)|bristol west|safe ?auto|assurance ?america|acceptance ins|gainsco|kemper|esurance|mercury ins|auto ins(?:urance)?|car insurance)\b/;

/** Giving: churches, tithes and the apps churches use, charities. Not "CHURCH'S CHICKEN". */
const DONATION = /\b(?:church(?!'?s\b)|iglesia|ministr(?:y|ies)|ministerio|tithe|tithing|diezmo|ofrenda|tithe\.?ly|pushpay|givelify|subsplash|church ?center|vanco|parish|parroquia|baptist|methodist|catholic|pentecostal|assembly of god|asamblea de dios|kingdom hall|st\.? jude|alsac|red cross|unicef|gofundme|donation|donacion|donaci[oó]n)\b/;

/** Sending money abroad (remittance companies). Not their bill-pay services ("WU SPEEDPAY", "MONEYGRAM EXPRESSPAYMENT"). */
const REMITTANCE = /\b(?:remitly|western union|wu\b|xoom|moneygram|intermex|viamericas|ria (?:money|financial|envia)|boss ?money|sendwave|worldremit|world remit|pangea|dolex|la nacional|barri|vigo|uniteller|sigue|envios|env[ií]o de dinero|cash ?app intl)\b/;
const NOT_REMITTANCE = /\b(?:speedpay|express ?payment|bill ?pay|quick ?collect)\b/;

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
  if (plaidAmount > 0 && CAR_INSURANCE.test(d)) return "car_insurance";
  if (plaidAmount > 0 && DONATION.test(d)) return "donations";
  if (plaidAmount > 0 && REMITTANCE.test(d) && !NOT_REMITTANCE.test(d)) return "remittance";
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
  if (detailed === "GENERAL_SERVICES_INSURANCE" && CAR_INSURANCE.test(` ${description.toLowerCase()} `)) return "car_insurance";
  if (detailed.includes("DONATIONS") && plaidAmount > 0) return "donations";
  if (detailed.startsWith("GOVERNMENT_AND_NON_PROFIT") && plaidAmount > 0) return "government";
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

// ─── Gas Station Detection — ALL brands ───
const GAS_BRANDS_ALL = [
  "shell","exxon","chevron","bp","mobil","texaco","marathon","speedway",
  "valero","citgo","phillips 66","circle k","sinclair","gulf","esso","arco",
  "76","union 76","kum & go","kum and go","quik trip","quiktrip","race trac",
  "racetrac","sheetz","wawa","pilot","flying j","love's","maverik","thorntons",
  "stripes","murphy usa","casey's","holiday","cumberland farms","royal farms",
  "getgo","parkers","quick chek","stewart's","oncue","p66","sam's club gas",
  "costco gas","walmart gas","kennedy",
];
export function isGasStation(desc: string): boolean {
  const d = desc.toLowerCase();
  // Check all known brands with word-boundary to avoid substring matches
  // (e.g., "alarcon" should NOT match "arco", "mobile" should NOT match "mobil")
  for (const brand of GAS_BRANDS_ALL) {
    // Escape special regex chars in brand name
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundary for short brands (< 5 chars) to avoid false positives
    if (brand.length < 5) {
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      if (regex.test(d)) return true;
    } else {
      // For longer brands, includes() is safe enough
      if (d.includes(brand)) return true;
    }
  }
  // Generic gas keywords
  if (d.includes("gas station") || d.includes("gasoline") || d.includes("gas sta")) return true;
  return false;
}

/**
 * Chains people know by name (owner, 2026-11-24: "enséñale las cadenas conocidas"): fast food, restaurants,
 * supermarkets (Alabama's too, and Hispanic markets by their words), pharmacies, big stores, delivery apps and gas.
 * In personal accounts the app confirms them by itself (api/lib/autoConfirm.ts).
 */
export type ChainKind = "fast_food" | "restaurant" | "coffee" | "grocery" | "pharmacy" | "store" | "delivery" | "gas";
const CHAINS: Array<[ChainKind, RegExp]> = [
  ["delivery", /\b(?:doordash|dd \*|uber ?eats|grubhub|instacart|postmates|uber ?\*? ?trip|uber\b|lyft)\b/],
  ["coffee", /\b(?:starbucks|dunkin|dutch bros|scooter'?s coffee|tim hortons|krispy kreme)\b/],
  ["fast_food", /\b(?:mc ?donald'?s|chick-?fil-?a|zaxby'?s|waffle house|sonic (?:drive|#|\d)|popeyes|raising cane'?s|bojangles|cook ?-?out|wendy'?s|burger king|taco bell|subway|whataburger|domino'?s|pizza hut|papa john'?s|little caesars|kfc|arby'?s|hardee'?s|jack'?s family|krystal|checkers|rally'?s|dairy queen|panda express|chipotle|moe'?s southwest|firehouse subs|jersey mike'?s|jimmy john'?s|five guys|wingstop|church'?s (?:chicken|texas)|del taco|captain d'?s|culver'?s|steak ?n ?shake|marco'?s pizza|jack in the box|carl'?s jr|in-?n-?out|white castle|el pollo loco|taqueria)\b/],
  ["restaurant", /\b(?:cracker barrel|applebee'?s|chili'?s|olive garden|texas roadhouse|longhorn steak|outback|ihop|denny'?s|huddle house|red lobster|buffalo wild wings|panera|logan'?s roadhouse|golden corral|ruby tuesday|red robin|cheesecake factory|o'?charley'?s|el patron|el charro|los arcos|restaurant|restaurante|grill|cafe|cafeteria|pupuseria|panaderia|bakery)\b/],
  ["grocery", /\b(?:publix|aldi|winn-?dixie|kroger|piggly wiggly|food giant|save-?a-?lot|sprouts|whole foods|trader joe'?s|food city|fresh market|harris teeter|h-?e-?b|food lion|walmart neighborhood|wm neighborhood|supermarket|supermercado|super mercado|grocery|groceries|carniceria|meat market|fiesta mart|el super|la michoacana|international market|latin market|mercado)\b/],
  ["pharmacy", /\b(?:cvs|walgreens|rite aid|pharmacy|farmacia)\b/],
  ["store", /\b(?:wal-?mart|wm supercenter|target|amazon|amzn|dollar general|family dollar|dollar tree|five below|ross stores|tj ?maxx|marshalls|burlington|home depot|lowe'?s|best buy|autozone|o'?reilly|advance auto|big lots|hobby lobby|michaels|ikea|shein|temu|costco|sam'?s club|bj'?s wholesale|academy sports|dick'?s sporting|old navy|kohl'?s|jcpenney|belk|marshalls)\b/],
];

/** The kind of chain a bank movement names, or null. */
export function knownChain(text: string | null | undefined): ChainKind | null {
  const t = ` ${(text ?? "").toLowerCase().replace(/\s+/g, " ")} `;
  if (isGasStation(t)) return "gas";
  for (const [kind, re] of CHAINS) if (re.test(t)) return kind;
  return null;
}

/** The category a chain goes in when nothing better says otherwise (stores, delivery and gas keep their own rules). */
export const CHAIN_CATEGORY: Partial<Record<ChainKind, string>> = {
  fast_food: "fast_food", restaurant: "food", coffee: "coffee", grocery: "food", pharmacy: "medical",
};

/** The categories that fit each kind of chain (the bank sync may have used Plaid's own). */
export const CHAIN_FITS: Record<ChainKind, ReadonlySet<string>> = {
  fast_food: new Set(["fast_food", "food", "food_delivery"]),
  restaurant: new Set(["food", "fast_food"]),
  coffee: new Set(["coffee", "food", "fast_food"]),
  grocery: new Set(["food", "home_expense"]),
  pharmacy: new Set(["medical"]),
  store: new Set(["shopping", "retail", "wholesale", "electronics", "home_expense"]),
  delivery: new Set(["food_delivery", "rideshare"]),
  gas: new Set(["gasolina"]),
};

/**
 * Money coming in that the app knows by name (owner, 2026-11-24): a paycheck (payroll companies, "PAYROLL",
 * "DIRECT DEP") and a tax refund (IRS, Alabama). `plaidAmount` < 0 is money in; anything else is null.
 */
export type KnownIncome = "paycheck" | "tax_refund";
const PAYROLL = /\b(?:payroll|payrll|pyrl|salary|sueldo|nomina|n[oó]mina|adp|paychex|gusto|trinet|paylocity|paycom|paycor|ukg|ceridian|dayforce|rippling|justworks|insperity|onpay|intuit payroll|quickbooks payroll|square payroll|direct dep(?:osit)?|dir dep|dirdep)\b/;
// Not "TREAS 310" alone: Social Security and VA benefits come that way too ("SSA TREAS 310 XXSOC SEC").
const TAX_REFUND = /\b(?:irs treas|tax ref(?:und)?|al(?:abama)? dept (?:of )?rev(?:enue)?|aldor|dept of revenue refund|state tax refund)\b/;
export function knownIncome(description: string, plaidDetailed: string | null | undefined, plaidAmount: number): KnownIncome | null {
  if (!(plaidAmount < 0)) return null;
  const d = ` ${(description ?? "").toLowerCase().replace(/\s+/g, " ")} `;
  const detailed = (plaidDetailed ?? "").toUpperCase();
  if (detailed === "INCOME_TAX_REFUND" || TAX_REFUND.test(d)) return "tax_refund";
  if (detailed === "INCOME_WAGES" || PAYROLL.test(d)) return "paycheck";
  return null;
}
