// Copy for the AI assistant page (src/pages/Assistant.tsx), laid out like the 2.0 prototype's "assistant" screen.
import type { Lang } from "../lang";

type Mode = "business" | "personal";

const es = {
  nav: "Asistente",
  title: "Asistente",
  subtitle: "Respuestas con tus números, y de dónde sale cada uno.",
  // Header: the month's questions
  quota: (limit: number, left: number) => `${limit} preguntas al mes · te quedan ${left}`,
  noQuota: "Tu plan no incluye preguntas",
  clear: "Borrar conversación",
  clearShort: "Borrar",
  clearConfirm: "¿Borrar la conversación? Las preguntas de este mes se siguen contando.",
  // Revisión de hoy (the bell's notices, from your data)
  review: {
    title: "Revisión de hoy",
    sub: "Lo que hay que mirar hoy, con tus datos",
    ok: "Todo en orden hoy. No encontré nada pendiente.",
    see: "Ver",
    more: (n: number) => (n === 1 ? "1 más en la campanita" : `${n} más en la campanita`),
  },
  // Chat
  hello: {
    business: (name: string) => `Hola${name ? ` ${name}` : ""}. Pregúntame lo que quieras sobre tu negocio. Busco en tus ventas, gastos, facturas y bancos, y te digo de dónde sale cada número.`,
    personal: (name: string) => `Hola${name ? ` ${name}` : ""}. Pregúntame lo que quieras sobre tu dinero. Busco en tus movimientos, presupuestos y metas, y te digo de dónde sale cada número.`,
  } as Record<Mode, (name: string) => string>,
  chatLabel: "Conversación con el asistente",
  you: "Tú",
  assistant: "Asistente",
  thinking: "Revisando tus números…",
  sources: "De dónde sale:",
  source: {
    bank: (range: string) => `Tus bancos · ${range}`,
    bankTx: (n: number, range: string) => `${n === 1 ? "1 movimiento" : `${n} movimientos`} del banco · ${range}`,
    sales: (range: string) => `Ventas · ${range}`,
    expenses: (range: string) => `Gastos · ${range}`,
    receivables: (n: number) => (n === 1 ? "1 factura por cobrar" : `${n} facturas por cobrar`),
    invoice: (name: string, amount: string) => `Factura de ${name || "un cliente"} · ${amount}`,
    bills: (n: number) => (n === 1 ? "1 factura de proveedor" : `${n} facturas de proveedores`),
    goals: "Tus metas",
    budgets: "Tus presupuestos",
  },
  // Suggested questions
  suggestions: {
    business: {
      main: ["¿Quién me debe dinero?", "¿Cuánto vendí este mes?", "¿Qué tengo que pagar esta semana?", "¿En qué gasté más este mes?", "Compara este mes con el mes pasado"],
      more: ["¿Qué facturas están vencidas?", "¿Quiénes son mis mejores clientes?", "¿Cuánto entró al banco este mes?", "Hazme un resumen de la semana pasada"],
    },
    personal: {
      main: ["¿En qué gasté más este mes?", "¿Qué categoría va arriba de su presupuesto?", "¿Cómo voy con mis metas?", "¿Cuánto entró a mi cuenta este mes?"],
      more: ["¿Cuánto gasté en comida este mes?", "Compara este mes con el mes pasado", "¿Cuánto pago en suscripciones?", "Hazme un resumen de la semana pasada"],
    },
  } as Record<Mode, { main: string[]; more: string[] }>,
  moreExamples: "Más ejemplos",
  lessExamples: "Menos ejemplos",
  // Ask
  label: "Pregunta para el asistente",
  placeholder: "Escribe una pregunta",
  send: "Preguntar",
  sending: "Pensando…",
  disclaimer: "El asistente puede equivocarse. Revisa los números importantes antes de decidir.",
  used: "Ya usaste todas las preguntas de este mes.",
  noPlan: "Tu plan no incluye el asistente.",
  changePlan: "Ver planes",
  notReady: {
    title: "El asistente no está disponible por ahora",
    text: "Lo estamos preparando. Tus números siguen al día en el resto de la app, y tu resumen de la semana sí está aquí al lado.",
  },
  error: "No pude contestar ahora. Inténtalo de nuevo.",
  loadError: "No pudimos abrir el asistente.",
  retry: "Intentar de nuevo",
  // Usage
  usage: {
    title: "Tus preguntas",
    usedOf: (used: number, limit: number) => `Llevas ${used} de ${limit} este mes`,
    left: (n: number) => (n === 1 ? "Te queda 1" : `Te quedan ${n}`),
    renews: (date: string) => `Se renuevan el ${date}.`,
    bar: (left: number, limit: number) => `Te quedan ${left} de ${limit} preguntas este mes`,
  },
  // Weekly summary (worked out from your data; no question used)
  week: {
    title: (monday: string) => `Tu resumen del ${monday}`,
    note: "Con tus datos · no usa preguntas",
    see: "ver",
    loading: "Preparando tu resumen…",
    error: "No pudimos preparar tu resumen.",
    // business
    bank: (moneyIn: string, moneyOut: string) => ["La semana pasada entraron ", moneyIn, ` y salieron ${moneyOut}.`] as [string, string, string],
    sold: (sold: string, spent: string) => ["La semana pasada vendiste ", sold, ` y registraste ${spent} en gastos.`] as [string, string, string],
    quiet: "La semana pasada no hubo movimientos en tus bancos ni ventas.",
    late: (n: number, client: string, amount: string) => `${n === 1 ? "1 factura vencida" : `${n} facturas vencidas`}: ${client || "un cliente"} te debe ${amount}`,
    owed: (total: string, n: number) => `Te deben ${total} en ${n === 1 ? "1 factura" : `${n} facturas`}`,
    noOwed: "Nadie te debe dinero ahora.",
    bills: (total: string, late: number) => `Esta semana pagas ${total} a proveedores${late ? ` (${late === 1 ? "1 ya venció" : `${late} ya vencieron`})` : ""}`,
    noBills: "No tienes facturas de proveedores por pagar esta semana.",
    // personal
    spent: (amount: string, top: string, topAmount: string) => ["La semana pasada gastaste ", amount, top ? `; lo que más, ${top} (${topAmount}).` : "."] as [string, string, string],
    noSpent: "La semana pasada no hubo gastos en tus cuentas.",
    over: (cat: string, by: string) => `${cat} va ${by} arriba de su presupuesto`,
    inBudget: "Todas tus categorías van dentro de su presupuesto.",
    noBudgets: "Todavía no tienes presupuestos",
    create: "crear",
    goals: (saved: string, target: string) => `Tus metas: llevas ${saved} de ${target}`,
    ask: "Pídele más detalle al asistente",
    askNote: "Usa 1 pregunta",
    askQuestion: "Hazme un resumen de la semana pasada: lo que entró, lo que salió y lo que viene esta semana.",
  },
  // What it can and can't do
  can: {
    title: "Lo que puedo hacer",
    items: ["Contestar con tus números", "Decirte de dónde sale cada número", "Comparar meses y encontrar en qué se va el dinero", "Llevarte a la pantalla donde se hace algo"],
    neverTitle: "Lo que nunca hago",
    never: ["Mover dinero", "Cambiar o borrar nada", "Ver datos de otras personas", "Cambiar la app"],
  },
};

export type AssistantCopy = typeof es;

const en: AssistantCopy = {
  nav: "Assistant",
  title: "Assistant",
  subtitle: "Answers with your numbers, and where each one comes from.",
  quota: (limit: number, left: number) => `${limit} questions a month · ${left} left`,
  noQuota: "Your plan doesn't include questions",
  clear: "Clear conversation",
  clearShort: "Clear",
  clearConfirm: "Clear the conversation? This month's questions still count.",
  review: {
    title: "Today's check",
    sub: "What needs a look today, from your data",
    ok: "All good today. I didn't find anything pending.",
    see: "View",
    more: (n: number) => (n === 1 ? "1 more in the bell" : `${n} more in the bell`),
  },
  hello: {
    business: (name: string) => `Hi${name ? ` ${name}` : ""}. Ask me anything about your business. I look through your sales, expenses, invoices and banks, and tell you where each number comes from.`,
    personal: (name: string) => `Hi${name ? ` ${name}` : ""}. Ask me anything about your money. I look through your transactions, budgets and goals, and tell you where each number comes from.`,
  },
  chatLabel: "Conversation with the assistant",
  you: "You",
  assistant: "Assistant",
  thinking: "Checking your numbers…",
  sources: "Where it comes from:",
  source: {
    bank: (range: string) => `Your banks · ${range}`,
    bankTx: (n: number, range: string) => `${n === 1 ? "1 bank transaction" : `${n} bank transactions`} · ${range}`,
    sales: (range: string) => `Sales · ${range}`,
    expenses: (range: string) => `Expenses · ${range}`,
    receivables: (n: number) => (n === 1 ? "1 invoice to collect" : `${n} invoices to collect`),
    invoice: (name: string, amount: string) => `Invoice for ${name || "a client"} · ${amount}`,
    bills: (n: number) => (n === 1 ? "1 vendor bill" : `${n} vendor bills`),
    goals: "Your goals",
    budgets: "Your budgets",
  },
  suggestions: {
    business: {
      main: ["Who owes me money?", "How much did I sell this month?", "What do I have to pay this week?", "What did I spend the most on this month?", "Compare this month with last month"],
      more: ["Which invoices are overdue?", "Who are my best clients?", "How much came into the bank this month?", "Give me a summary of last week"],
    },
    personal: {
      main: ["What did I spend the most on this month?", "Which category is over its budget?", "How am I doing with my goals?", "How much came into my account this month?"],
      more: ["How much did I spend on food this month?", "Compare this month with last month", "How much do I pay in subscriptions?", "Give me a summary of last week"],
    },
  },
  moreExamples: "More examples",
  lessExamples: "Fewer examples",
  label: "Question for the assistant",
  placeholder: "Write a question",
  send: "Ask",
  sending: "Thinking…",
  disclaimer: "The assistant can make mistakes. Check important numbers before deciding.",
  used: "You've used all of this month's questions.",
  noPlan: "Your plan doesn't include the assistant.",
  changePlan: "See plans",
  notReady: {
    title: "The assistant isn't available right now",
    text: "We're getting it ready. Your numbers are still up to date everywhere else in the app, and your weekly summary is right here.",
  },
  error: "I couldn't answer right now. Please try again.",
  loadError: "We couldn't open the assistant.",
  retry: "Try again",
  usage: {
    title: "Your questions",
    usedOf: (used: number, limit: number) => `${used} of ${limit} used this month`,
    left: (n: number) => `${n} left`,
    renews: (date: string) => `They renew on ${date}.`,
    bar: (left: number, limit: number) => `${left} of ${limit} questions left this month`,
  },
  week: {
    title: (monday: string) => `Your summary for ${monday}`,
    note: "From your data · uses no questions",
    see: "view",
    loading: "Getting your summary ready…",
    error: "We couldn't put your summary together.",
    bank: (moneyIn: string, moneyOut: string) => ["Last week ", moneyIn, ` came in and ${moneyOut} went out.`],
    sold: (sold: string, spent: string) => ["Last week you sold ", sold, ` and recorded ${spent} in expenses.`],
    quiet: "Last week there was no bank activity and no sales.",
    late: (n: number, client: string, amount: string) => `${n === 1 ? "1 overdue invoice" : `${n} overdue invoices`}: ${client || "a client"} owes you ${amount}`,
    owed: (total: string, n: number) => `You're owed ${total} on ${n === 1 ? "1 invoice" : `${n} invoices`}`,
    noOwed: "Nobody owes you money right now.",
    bills: (total: string, late: number) => `This week you pay ${total} to vendors${late ? ` (${late} already overdue)` : ""}`,
    noBills: "You have no vendor bills to pay this week.",
    spent: (amount: string, top: string, topAmount: string) => ["Last week you spent ", amount, top ? `; the most on ${top} (${topAmount}).` : "."],
    noSpent: "Last week there was no spending in your accounts.",
    over: (cat: string, by: string) => `${cat} is ${by} over its budget`,
    inBudget: "All your categories are within their budget.",
    noBudgets: "You don't have budgets yet",
    create: "create",
    goals: (saved: string, target: string) => `Your goals: ${saved} of ${target} saved`,
    ask: "Ask the assistant for more detail",
    askNote: "Uses 1 question",
    askQuestion: "Give me a summary of last week: what came in, what went out and what's coming this week.",
  },
  can: {
    title: "What I can do",
    items: ["Answer with your numbers", "Tell you where each number comes from", "Compare months and find where the money goes", "Take you to the screen where something is done"],
    neverTitle: "What I never do",
    never: ["Move money", "Change or delete anything", "See other people's data", "Change the app"],
  },
};

export const assistantCopy: Record<Lang, AssistantCopy> = { es, en };
