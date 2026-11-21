// Copy for the 2.0 business home (src/pages/Dashboard.tsx).
import type { Lang } from "../lang";

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const es = {
  hello: (name: string) => (name ? `Hola, ${name}` : "Hola"),
  status: (sales: string, profit: string, up: boolean) =>
    `Este mes llevas ${sales} en ventas y ${profit} de ${up ? "ganancia" : "pérdida"}.`,
  statusEmpty: "Cuando cobres tu primera venta, aquí verás cómo va tu mes.",
  charge: "Cobrar",
  kpi: {
    bank: "En el banco",
    bankSub: "Saldo de tus cuentas",
    bankNone: "Conecta tu banco",
    owed: "Te deben",
    owedSub: (n: number) => (n === 1 ? "1 venta por cobrar" : `${n} ventas por cobrar`),
    owe: "Debes",
    oweSub: (n: number, late: number) => `${n === 1 ? "1 factura" : `${n} facturas`} por pagar${late ? ` · ${late} vencida${late === 1 ? "" : "s"}` : ""}`,
    today: "Ventas de hoy",
    todaySub: (n: number) => (n === 1 ? "1 venta" : `${n} ventas`),
    monthExp: "Gastos del mes",
    monthExpSub: "Lo que registraste",
    profit: (month: string) => `Ganancia de ${month}`,
    profitSub: (sales: string, exp: string) => `${sales} en ventas − ${exp} en gastos`,
  },
  shortcuts: { pos: "Cobrar", quote: "Cotización", receipt: "Foto de recibo", bill: "Factura por pagar" },
  locked: "Tu plan no lo incluye",
  today: { title: "Para hoy", tag: "Lo más urgente primero", open: "Abrir" },
  tasks: {
    connectBank: ["Conecta tu banco", "Tus movimientos llegan solos y la app los ordena."],
    late: (n: number, total: number) => [`Tienes ${n === 1 ? "1 factura vencida" : `${n} facturas vencidas`}`, `${money(total)} por pagar a tus proveedores`] as [string, string],
    soon: (n: number, total: number) => [`${n === 1 ? "1 factura vence" : `${n} facturas vencen`} esta semana`, `${money(total)} en total`] as [string, string],
    collect: (n: number, total: number) => [`Cobra ${n === 1 ? "1 venta pendiente" : `${n} ventas pendientes`}`, `${money(total)} que te deben`] as [string, string],
    taxDocs: ["Sube tus documentos de impuestos", "Tu preparador empieza cuando los tenga."],
    taxRedo: (n: number) => [`Tu preparador te pidió ${n === 1 ? "1 documento" : `${n} documentos`}`, "Súbelo de nuevo desde Impuestos."] as [string, string],
    receipts: (left: number) => [`Te quedan ${left} fotos de recibo este mes`, "Tu plan Básico incluye 20 al mes."] as [string, string],
    allDone: ["Todo al día", "No hay nada urgente por ahora."],
  },
  forecast: {
    title: "En 30 días tendrás",
    note: "Estimado: tu saldo de hoy, más lo que te deben, menos las facturas que vencen en 30 días.",
    in: "Entra",
    out: "Sale",
  },
  week: { title: "Ventas de los últimos 7 días", total: "Total", best: (day: string, amount: string) => `Tu mejor día fue el ${day}: ${amount}.`, none: "Sin ventas en los últimos 7 días." },
  recent: { title: "Ventas recientes", all: "Ver todo", none: "Todavía no hay ventas.", sale: "Venta", status: { pending: "Por cobrar", cancelled: "Anulada", refunded: "Devuelta" } as Record<string, string> },
  methods: { cash: "Efectivo", zelle: "Zelle", card: "Tarjeta", mixed: "Mixto" } as Record<string, string>,
};

export type HomeCopy = typeof es;

const en: HomeCopy = {
  hello: (name: string) => (name ? `Hi, ${name}` : "Hi"),
  status: (sales: string, profit: string, up: boolean) => `This month you have ${sales} in sales and ${profit} in ${up ? "profit" : "loss"}.`,
  statusEmpty: "Once you make your first sale, you'll see how your month is going here.",
  charge: "Checkout",
  kpi: {
    bank: "In the bank",
    bankSub: "Balance of your accounts",
    bankNone: "Connect your bank",
    owed: "Owed to you",
    owedSub: (n: number) => (n === 1 ? "1 sale to collect" : `${n} sales to collect`),
    owe: "You owe",
    oweSub: (n: number, late: number) => `${n === 1 ? "1 bill" : `${n} bills`} to pay${late ? ` · ${late} overdue` : ""}`,
    today: "Today's sales",
    todaySub: (n: number) => (n === 1 ? "1 sale" : `${n} sales`),
    monthExp: "This month's expenses",
    monthExpSub: "What you recorded",
    profit: (month: string) => `${month} profit`,
    profitSub: (sales: string, exp: string) => `${sales} in sales − ${exp} in expenses`,
  },
  shortcuts: { pos: "Checkout", quote: "Quote", receipt: "Receipt photo", bill: "Bill to pay" },
  locked: "Not in your plan",
  today: { title: "For today", tag: "Most urgent first", open: "Open" },
  tasks: {
    connectBank: ["Connect your bank", "Your transactions arrive on their own and the app sorts them."],
    late: (n: number, total: number) => [`You have ${n === 1 ? "1 overdue bill" : `${n} overdue bills`}`, `${money(total)} to pay your vendors`],
    soon: (n: number, total: number) => [`${n === 1 ? "1 bill is" : `${n} bills are`} due this week`, `${money(total)} in total`],
    collect: (n: number, total: number) => [`Collect ${n === 1 ? "1 pending sale" : `${n} pending sales`}`, `${money(total)} owed to you`],
    taxDocs: ["Upload your tax documents", "Your preparer starts once they have them."],
    taxRedo: (n: number) => [`Your preparer asked for ${n === 1 ? "1 document" : `${n} documents`}`, "Upload it again from Taxes."],
    receipts: (left: number) => [`${left} receipt photos left this month`, "Your Basic plan includes 20 a month."],
    allDone: ["All caught up", "Nothing urgent right now."],
  },
  forecast: {
    title: "In 30 days you'll have",
    note: "Estimate: today's balance, plus what you're owed, minus the bills due in 30 days.",
    in: "In",
    out: "Out",
  },
  week: { title: "Sales, last 7 days", total: "Total", best: (day: string, amount: string) => `Your best day was ${day}: ${amount}.`, none: "No sales in the last 7 days." },
  recent: { title: "Recent sales", all: "See all", none: "No sales yet.", sale: "Sale", status: { pending: "To collect", cancelled: "Voided", refunded: "Refunded" } },
  methods: { cash: "Cash", zelle: "Zelle", card: "Card", mixed: "Mixed" },
};

export const homeCopy: Record<Lang, HomeCopy> = { es, en };
