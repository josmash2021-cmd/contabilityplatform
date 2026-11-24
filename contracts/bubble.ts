// ── The assistant's bubble: what it may do on screen ──
// The bubble can only run the tasks listed here (owner, 2026-11-24): a closed list, the same for the server (which
// checks what the model offers) and the browser (which knows the steps of each one). Anything else, it answers in
// words. It never touches the plan or payments, passwords or the account's access, other people's data, or the app
// itself (no new options or pages): it may only repair the person's own data with the app's normal buttons.

/** Personal spending categories a budget or a movement can have (keys as stored in the database). */
export const PERSONAL_EXPENSE_KEYS = [
  "food", "home_expense", "shopping", "gasolina", "medical", "subscription", "zelle_sent", "cash_withdrawal", "transfer",
  "business_expense", "other", "loan", "rent", "utilities", "insurance", "health_insurance", "government", "card_payment",
  "car_insurance", "donations", "remittance",
] as const;
/** Personal money-in categories a movement can have. */
export const PERSONAL_INCOME_KEYS = [
  "zelle_income", "transfer_income", "deposit", "cash_deposit", "cash_income", "income", "paycheck", "tax_refund", "transfer",
] as const;
/** Categories a budget can't have: they aren't spending (paying a card, moving money between your own accounts). */
export const NOT_BUDGETABLE = new Set<string>(["card_payment", "transfer"]);

/** The colors a person can give their own circle (the initial in the menu). Blue is the app's own. */
export const USER_COLORS = ["blue", "violet", "teal", "green", "amber", "rose", "slate"] as const;
export type UserColor = (typeof USER_COLORS)[number];
export const isUserColor = (v: unknown): v is UserColor => typeof v === "string" && (USER_COLORS as readonly string[]).includes(v);

/** The tasks, per side of the app. */
export const BUBBLE_TASKS = {
  personal: ["budget", "goal", "connect_bank", "change_category", "review", "sync_bank", "user_color"],
  business: ["customer", "invoice", "receipt", "connect_bank", "user_color"],
} as const;
export type BubbleTaskName = (typeof BUBBLE_TASKS)["personal" | "business"][number];

/** A task the bubble offers, with what it will do (the server fills in what it looked up, like a movement's month). */
export type BubbleTask =
  | { task: "budget"; category: string; amount: number }
  | { task: "goal"; name: string; amount: number; monthly: number | null }
  | { task: "connect_bank" }
  | { task: "change_category"; transactionId: number; category: string; type: "income" | "expense"; name: string; amount: number; date: string }
  | { task: "review" }
  | { task: "sync_bank" }
  | { task: "user_color"; color: UserColor }
  | { task: "customer"; name: string; lastName: string; phone: string; email: string }
  | { task: "invoice" }
  | { task: "receipt" };

/** A problem the bubble may send to support (only the app's own faults; the person's data it repairs itself). */
export type BubbleReport = { summary: string };

/** Longest summary sent to support. */
export const REPORT_MAX = 600;
