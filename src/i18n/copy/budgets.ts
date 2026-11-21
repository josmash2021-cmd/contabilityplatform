// Copy for Presupuestos (personal Pro): the budgets page (src/pages/PersonalBudgets.tsx)
// and the alert card on the personal dashboard. Category names come from
// personalCopy.categories.expense (keys are database values); the math lives in api/lib/budgets.ts.
import type { Lang } from "../lang";

const es = {
  title: "Presupuestos",
  subtitle: "Ponle un tope a lo que gastas cada mes. Te avisamos cuando llegues al 80%.",
  month: {
    label: "Mes",
    prev: "Mes anterior",
    next: "Mes siguiente",
    current: "Volver a este mes",
  },
  loading: "Cargando tus presupuestos…",
  error: "No se pudieron cargar tus presupuestos.",
  retry: "Reintentar",
  locked: {
    title: "Los presupuestos vienen en Pro",
    text: "Con Pro le pones un tope a cada categoría de gasto y te avisamos cuando te acercas o te pasas.",
    points: ["Un tope mensual para cada categoría", "Aviso al llegar al 80%", "Ves cuánto te queda en cada una"],
    cta: "Ver planes",
  },
  noBank: {
    text: "Conecta tu banco para ver cuánto gastas en cada categoría.",
    cta: "Conectar banco",
  },
  summary: {
    label: (month: string, current: boolean) => (current ? "Este mes, en lo que tiene tope" : `En ${month}, en lo que tiene tope`),
    spentOf: (spent: string, limit: string) => `Llevas ${spent} de ${limit}`,
    left: (amount: string) => `Te quedan ${amount}`,
    overTotal: (amount: string) => `Te pasaste por ${amount} en total`,
    of: (limit: string) => `de ${limit}`,
    count: (n: number) => (n === 1 ? "1 presupuesto" : `${n} presupuestos`),
    near: (n: number) => (n === 1 ? "1 cerca del tope" : `${n} cerca del tope`),
    over: (n: number) => (n === 1 ? "1 pasado" : `${n} pasados`),
    allOk: "Todos van bien",
  },
  status: {
    ok: "Vas bien",
    near: "Cerca del tope",
    over: "Te pasaste",
  },
  spentOf: (spent: string, limit: string) => `${spent} de ${limit}`,
  spentPct: (spent: string, percent: number) => `${spent} gastado · ${percent}%`,
  percentUsed: (category: string, percent: number) => `${category}: ${percent}% del tope usado`,
  left: (amount: string) => `Te quedan ${amount}`,
  leftOf: (left: string, limit: string) => `Te quedan ${left} de ${limit}`,
  overBy: (amount: string) => `Te pasaste por ${amount}`,
  overOf: (amount: string, limit: string) => `Te pasaste por ${amount} (tu tope es ${limit})`,
  spentThisMonth: (amount: string) => `${amount} gastado`,
  noSpending: "Sin gastos",
  budgetsTitle: "Tus presupuestos",
  othersTitle: "Sin tope todavía",
  othersText: "El tope que pongas se aplica todos los meses.",
  setLimit: "Poner tope",
  edit: "Cambiar",
  remove: "Quitar",
  setAria: (category: string) => `Poner tope a ${category}`,
  editAria: (category: string) => `Cambiar el tope de ${category}`,
  removeAria: (category: string) => `Quitar el tope de ${category}`,
  form: {
    label: (category: string) => `Tope mensual para ${category}`,
    placeholder: "300",
    save: "Guardar",
    cancel: "Cancelar",
    invalid: "Escribe una cantidad mayor que $0.",
    tooBig: "Esa cantidad es demasiado alta.",
  },
  saved: (category: string) => `Tope guardado para ${category}`,
  removed: (category: string) => `Quitaste el tope de ${category}`,
  empty: {
    title: "Aún no tienes presupuestos",
    withSpending: "Empieza por donde más gastas este mes. Te sugerimos un tope un poco arriba de lo que llevas:",
    noSpending: "Elige una categoría abajo y ponle un tope mensual.",
    use: (amount: string) => `Poner ${amount}`,
    useAria: (category: string, amount: string) => `Poner un tope de ${amount} a ${category}`,
  },
  // Card on the personal dashboard.
  alert: {
    title: "Presupuestos en alerta",
    near: (percent: number) => `Al ${percent}% del tope`,
    over: (amount: string) => `Te pasaste por ${amount}`,
    cta: "Ver presupuestos",
  },
};

export type BudgetsCopy = typeof es;

const en: BudgetsCopy = {
  title: "Budgets",
  subtitle: "Set a monthly limit on what you spend. We'll let you know when you hit 80%.",
  month: {
    label: "Month",
    prev: "Previous month",
    next: "Next month",
    current: "Back to this month",
  },
  loading: "Loading your budgets…",
  error: "Couldn't load your budgets.",
  retry: "Try again",
  locked: {
    title: "Budgets come with Pro",
    text: "With Pro you set a limit for each spending category, and we let you know when you're getting close or go over.",
    points: ["A monthly limit for each category", "A heads-up at 80%", "See what's left in each one"],
    cta: "See plans",
  },
  noBank: {
    text: "Connect your bank to see how much you spend in each category.",
    cta: "Connect bank",
  },
  summary: {
    label: (month: string, current: boolean) => (current ? "This month, in what has a limit" : `In ${month}, in what has a limit`),
    spentOf: (spent: string, limit: string) => `You've spent ${spent} of ${limit}`,
    left: (amount: string) => `${amount} left`,
    overTotal: (amount: string) => `You're ${amount} over in total`,
    of: (limit: string) => `of ${limit}`,
    count: (n: number) => (n === 1 ? "1 budget" : `${n} budgets`),
    near: (n: number) => (n === 1 ? "1 close to the limit" : `${n} close to the limit`),
    over: (n: number) => `${n} over`,
    allOk: "All on track",
  },
  status: {
    ok: "On track",
    near: "Close to the limit",
    over: "Over the limit",
  },
  spentOf: (spent: string, limit: string) => `${spent} of ${limit}`,
  spentPct: (spent: string, percent: number) => `${spent} spent · ${percent}%`,
  percentUsed: (category: string, percent: number) => `${category}: ${percent}% of the limit used`,
  left: (amount: string) => `${amount} left`,
  leftOf: (left: string, limit: string) => `${left} left of ${limit}`,
  overBy: (amount: string) => `Over by ${amount}`,
  overOf: (amount: string, limit: string) => `Over by ${amount} (your limit is ${limit})`,
  spentThisMonth: (amount: string) => `${amount} spent`,
  noSpending: "No spending",
  budgetsTitle: "Your budgets",
  othersTitle: "No limit yet",
  othersText: "The limit you set applies every month.",
  setLimit: "Set limit",
  edit: "Change",
  remove: "Remove",
  setAria: (category: string) => `Set a limit for ${category}`,
  editAria: (category: string) => `Change the limit for ${category}`,
  removeAria: (category: string) => `Remove the limit for ${category}`,
  form: {
    label: (category: string) => `Monthly limit for ${category}`,
    placeholder: "300",
    save: "Save",
    cancel: "Cancel",
    invalid: "Enter an amount greater than $0.",
    tooBig: "That amount is too high.",
  },
  saved: (category: string) => `Limit saved for ${category}`,
  removed: (category: string) => `Removed the limit for ${category}`,
  empty: {
    title: "You don't have any budgets yet",
    withSpending: "Start where you spend the most this month. We suggest a limit a little above what you've spent:",
    noSpending: "Pick a category below and give it a monthly limit.",
    use: (amount: string) => `Use ${amount}`,
    useAria: (category: string, amount: string) => `Set a ${amount} limit for ${category}`,
  },
  alert: {
    title: "Budgets to watch",
    near: (percent: number) => `${percent}% of the limit`,
    over: (amount: string) => `Over by ${amount}`,
    cta: "See budgets",
  },
};

export const budgetsCopy: Record<Lang, BudgetsCopy> = { es, en };

/** Display name for a spending category key: its personal-mode label, or the key made readable ("fast_food" → "Fast food"). */
export function budgetCategoryLabel(key: string, labels: Record<string, string>): string {
  const label = labels[key];
  if (label) return label;
  const words = key.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}
