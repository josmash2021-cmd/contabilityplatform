// Copy for Presupuestos (personal Pro): the budgets page (src/pages/PersonalBudgets.tsx)
// and the alert card on the personal dashboard. Category names come from
// personalCopy.categories.expense (keys are database values); the math lives in api/lib/budgets.ts.
import type { Lang } from "../lang";

const es = {
  title: "Presupuestos",
  subtitle: "Ponle un límite mensual a cada categoría y te avisamos al llegar al 80%.",
  month: {
    label: "Mes",
    prev: "Mes anterior",
    next: "Mes siguiente",
    current: "Este mes",
  },
  loading: "Cargando tus presupuestos…",
  error: "No se pudieron cargar tus presupuestos.",
  retry: "Reintentar",
  locked: {
    title: "Los presupuestos están en Pro",
    text: "Con Pro le pones un límite mensual a cada categoría de gasto y te avisamos cuando te acercas o te pasas.",
    cta: "Cambiar de plan",
  },
  noBank: {
    text: "Conecta tu banco para ver cuánto gastas en cada categoría.",
    cta: "Conectar banco",
  },
  summary: {
    label: "Gastado en tus categorías con límite",
    of: (limit: string) => `de ${limit}`,
    count: (n: number) => (n === 1 ? "1 presupuesto" : `${n} presupuestos`),
    near: (n: number) => (n === 1 ? "1 cerca del límite" : `${n} cerca del límite`),
    over: (n: number) => (n === 1 ? "1 pasado" : `${n} pasados`),
  },
  status: {
    ok: "Vas bien",
    near: "Cerca del límite",
    over: "Te pasaste",
  },
  spentOf: (spent: string, limit: string) => `${spent} de ${limit}`,
  percentUsed: (category: string, percent: number) => `${category}: ${percent}% del límite usado`,
  left: (amount: string) => `Te quedan ${amount}`,
  overBy: (amount: string) => `Te pasaste por ${amount}`,
  spentThisMonth: (amount: string) => `${amount} gastado`,
  noSpending: "Sin gastos",
  budgetsTitle: "Tus presupuestos",
  othersTitle: "Sin límite",
  othersText: "El límite que pongas se aplica todos los meses.",
  setLimit: "Poner límite",
  edit: "Cambiar",
  remove: "Quitar",
  setAria: (category: string) => `Poner límite a ${category}`,
  editAria: (category: string) => `Cambiar el límite de ${category}`,
  removeAria: (category: string) => `Quitar el límite de ${category}`,
  form: {
    label: (category: string) => `Límite mensual para ${category}`,
    placeholder: "300",
    save: "Guardar",
    cancel: "Cancelar",
    invalid: "Escribe una cantidad mayor que $0.",
    tooBig: "Esa cantidad es demasiado alta.",
  },
  saved: (category: string) => `Límite guardado para ${category}`,
  removed: (category: string) => `Quitaste el límite de ${category}`,
  empty: {
    title: "Aún no tienes presupuestos",
    withSpending: "Empieza por donde más gastas este mes:",
    noSpending: "Elige una categoría abajo y ponle un límite mensual.",
    use: (amount: string) => `Poner ${amount}`,
    useAria: (category: string, amount: string) => `Poner un límite de ${amount} a ${category}`,
  },
  // Card on the personal dashboard.
  alert: {
    title: "Presupuestos en alerta",
    near: (percent: number) => `Al ${percent}% del límite`,
    over: (amount: string) => `Te pasaste por ${amount}`,
    cta: "Ver presupuestos",
  },
};

export type BudgetsCopy = typeof es;

const en: BudgetsCopy = {
  title: "Budgets",
  subtitle: "Set a monthly limit for each category and we'll let you know at 80%.",
  month: {
    label: "Month",
    prev: "Previous month",
    next: "Next month",
    current: "This month",
  },
  loading: "Loading your budgets…",
  error: "Couldn't load your budgets.",
  retry: "Try again",
  locked: {
    title: "Budgets are in Pro",
    text: "With Pro you set a monthly limit for each spending category, and we let you know when you're getting close or go over.",
    cta: "Change plan",
  },
  noBank: {
    text: "Connect your bank to see how much you spend in each category.",
    cta: "Connect bank",
  },
  summary: {
    label: "Spent in your categories with a limit",
    of: (limit: string) => `of ${limit}`,
    count: (n: number) => (n === 1 ? "1 budget" : `${n} budgets`),
    near: (n: number) => (n === 1 ? "1 close to the limit" : `${n} close to the limit`),
    over: (n: number) => `${n} over`,
  },
  status: {
    ok: "On track",
    near: "Close to the limit",
    over: "Over the limit",
  },
  spentOf: (spent: string, limit: string) => `${spent} of ${limit}`,
  percentUsed: (category: string, percent: number) => `${category}: ${percent}% of the limit used`,
  left: (amount: string) => `${amount} left`,
  overBy: (amount: string) => `Over by ${amount}`,
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
    withSpending: "Start where you spend the most this month:",
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
