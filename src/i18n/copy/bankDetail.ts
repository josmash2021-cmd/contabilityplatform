// Copy for the bank category drill-down (/bank/category/:category and /personal/category/:category).
import type { Lang } from "../lang";

const es = {
  backBusiness: "Volver al Banco",
  backPersonal: "Volver",
  income: "Dinero que entró",
  expense: "Dinero que salió",
  total: (period: string) => `Total · ${period}`,
  count: (n: number) => (n === 1 ? "1 movimiento" : `${n} movimientos`),
  period: "Periodo",
  thisMonth: "Este mes",
  wholeYear: (year: string) => `Todo ${year}`,
  list: "Movimientos",
  empty: "No hay movimientos en esta categoría para este periodo.",
  error: "No pudimos cargar los movimientos.",
  retry: "Reintentar",
  reversed: "Reversado",
  allMovements: "Ver todos los movimientos",
  delete: (what: string) => `Eliminar ${what}`,
  confirmTitle: "¿Eliminar este movimiento?",
  confirmText: (what: string, amount: string) => `"${what}" por ${amount} se borra de la app junto con su asiento contable. Si el banco lo vuelve a enviar, aparecerá de nuevo.`,
  cancel: "Cancelar",
  confirm: "Sí, eliminar",
  deleted: "Movimiento eliminado",
  deleteError: "No pudimos eliminarlo. Intenta de nuevo.",
};

export type BankDetailCopy = typeof es;

const en: BankDetailCopy = {
  backBusiness: "Back to Bank",
  backPersonal: "Back",
  income: "Money that came in",
  expense: "Money that went out",
  total: (period: string) => `Total · ${period}`,
  count: (n: number) => (n === 1 ? "1 transaction" : `${n} transactions`),
  period: "Period",
  thisMonth: "This month",
  wholeYear: (year: string) => `All of ${year}`,
  list: "Transactions",
  empty: "No transactions in this category for this period.",
  error: "We couldn't load the transactions.",
  retry: "Try again",
  reversed: "Reversed",
  allMovements: "See all transactions",
  delete: (what: string) => `Delete ${what}`,
  confirmTitle: "Delete this transaction?",
  confirmText: (what: string, amount: string) => `"${what}" for ${amount} is removed from the app along with its journal entry. If the bank sends it again, it will reappear.`,
  cancel: "Cancel",
  confirm: "Yes, delete",
  deleted: "Transaction deleted",
  deleteError: "We couldn't delete it. Try again.",
};

export const bankDetailCopy: Record<Lang, BankDetailCopy> = { es, en };
