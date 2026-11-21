// Copy for the 2.0 personal bank page (src/pages/PersonalBank.tsx).
import type { Lang } from "../lang";

const es = {
  title: "Banco",
  subtitle: "Tus cuentas conectadas con Plaid",
  total: "Disponible en total",
  updated: (when: string) => `Actualizado ${when}`,
  neverUpdated: "Aún sin actualizar",
  refresh: "Actualizar saldos",
  refreshed: "Saldos actualizados",
  refreshError: "No pudimos actualizar ahora. Intenta en un momento.",
  accounts: "Tus cuentas",
  addAccount: "Conectar otra cuenta",
  types: { depository: "Cuenta", credit: "Tarjeta de crédito", loan: "Préstamo", investment: "Inversión" } as Record<string, string>,
  ending: (mask: string) => `termina en ${mask}`,
  owe: "Lo que debes",
  owedCards: (amount: string) => `Debes ${amount} en tarjetas y préstamos`,
  connect: {
    title: "Conecta tu banco",
    text: "Tus movimientos llegan solos y ordenados. Funciona con la mayoría de los bancos de EE. UU.",
    points: ["Lo hace Plaid: nunca vemos tu contraseña", "Solo lectura: nadie puede mover tu dinero desde la app", "Puedes desconectarlo cuando quieras"],
    button: "Conectar mi banco",
  },
  danger: {
    title: "Desconectar banco",
    text: "Se borra la conexión y la copia de tus movimientos en la app. Tus metas y presupuestos se quedan. Puedes volver a conectarlo cuando quieras.",
    button: "Desconectar",
    confirmTitle: "¿Desconectar tu banco?",
    confirmText: "Vamos a borrar tus cuentas y sus movimientos de la app. Esto no se puede deshacer, pero puedes conectarlo de nuevo cuando quieras.",
    cancel: "Cancelar",
    confirm: "Sí, desconectar",
    done: "Banco desconectado",
  },
};

export type PersonalBankCopy = typeof es;

const en: PersonalBankCopy = {
  title: "Bank",
  subtitle: "Your accounts connected through Plaid",
  total: "Available in total",
  updated: (when: string) => `Updated ${when}`,
  neverUpdated: "Not updated yet",
  refresh: "Refresh balances",
  refreshed: "Balances updated",
  refreshError: "We couldn't refresh right now. Try again in a moment.",
  accounts: "Your accounts",
  addAccount: "Connect another account",
  types: { depository: "Account", credit: "Credit card", loan: "Loan", investment: "Investment" },
  ending: (mask: string) => `ending in ${mask}`,
  owe: "What you owe",
  owedCards: (amount: string) => `You owe ${amount} on cards and loans`,
  connect: {
    title: "Connect your bank",
    text: "Your transactions arrive on their own, already sorted. Works with most US banks.",
    points: ["Plaid handles it: we never see your password", "Read-only: no one can move your money from the app", "Disconnect it whenever you want"],
    button: "Connect my bank",
  },
  danger: {
    title: "Disconnect bank",
    text: "This deletes the connection and the app's copy of your transactions. Your goals and budgets stay. You can connect it again anytime.",
    button: "Disconnect",
    confirmTitle: "Disconnect your bank?",
    confirmText: "We'll delete your accounts and their transactions from the app. This can't be undone, but you can connect again anytime.",
    cancel: "Cancel",
    confirm: "Yes, disconnect",
    done: "Bank disconnected",
  },
};

export const personalBankCopy: Record<Lang, PersonalBankCopy> = { es, en };
