// Copy for the business home, "Inicio" (src/pages/Dashboard.tsx), as in the 2.0 prototype's home screen.
import type { Lang } from "../lang";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** "María, este mes…", or "Este mes…" when there is no name. */
const withName = (name: string, rest: string) => (name ? `${name}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));

/** [before, the bold amount, after]: the green line under the greeting. */
type Status = [string, string, string];

const es = {
  hello: (name: string) => (name ? `Hola, ${name}` : "Hola"),
  /** "Miércoles 19 de noviembre". */
  date: (weekday: string, day: number, month: string) => `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day} de ${month}`,
  newInvoice: "Nueva factura",
  charge: "Cobrar",
  status: {
    /** This month is ahead of the same days last month (or there's nothing to compare with). */
    good: (name: string, left: string, pct: number | null, month: string): Status => [
      `${name ? `Vas bien, ${name}` : "Vas bien"}: este mes te quedan `, left,
      pct === null ? "." : pct === 0 ? `, igual que a estas alturas de ${month}.` : `, ${pct}% más que a estas alturas de ${month}.`,
    ],
    /** Still making money, but less than at this point last month. */
    down: (name: string, left: string, pct: number, month: string): Status => [
      `${withName(name, "este mes te quedan ")}`, left, `, ${pct}% menos que a estas alturas de ${month}.`,
    ],
    /** Spent more than sold. */
    loss: (name: string, amount: string): Status => [`${name ? `Ojo, ${name}` : "Ojo"}: este mes llevas `, amount, " más en gastos que en ventas."],
    empty: "Cuando registres ventas o gastos este mes, aquí verás cómo vas.",
  },
  kpi: {
    bank: "En el banco",
    accounts: (n: number) => plural(n, "1 cuenta", `${n} cuentas`),
    bankNone: "Conecta tu banco",
    owed: "Te deben",
    owedSub: (n: number, late: number) => (n === 0 ? "Nada por cobrar" : `${plural(n, "1 factura", `${n} facturas`)}${late ? ` · ${plural(late, "1 vencida", `${late} vencidas`)}` : ""}`),
    today: "Ventas de hoy",
    todaySub: (n: number) => plural(n, "1 venta", `${n} ventas`),
    owe: "Debes",
    oweSub: (n: number, late: number) => (n === 0 ? "Nada por pagar" : `${n} por pagar${late ? ` · ${plural(late, "1 vencida", `${late} vencidas`)}` : ""}`),
    monthExp: "Gastos del mes",
    monthExpSub: (n: number) => plural(n, "1 gasto", `${n} gastos`),
    profit: (month: string) => `Ganancia de ${month}`,
    vs: (pct: string, month: string) => `${pct} vs. ${month}`,
    profitSub: (sales: string, exp: string) => `${sales} en ventas − ${exp} en gastos`,
    vsTitle: (from: string, to: string) => `Comparado con lo que llevabas del ${from} al ${to}`,
  },
  shortcuts: { pos: "Cobrar", invoice: "Nueva factura", expense: "Gasto", receipt: "Foto de recibo" },
  locked: "Tu plan no lo incluye",
  today: {
    title: "Para hoy",
    tag: "Lo más urgente primero",
  },
  tasks: {
    review: (n: number) => [`Revisa ${plural(n, "1 movimiento", `${n} movimientos`)}`, `${plural(n, "Se aprueba", `${n} se aprueban`)} en un clic`] as [string, string],
    reviewBtn: "Revisar",
    collect: (client: string, invoice: string, amount: string, days: number) =>
      [`Cobra a ${client}`, `Factura ${invoice} · ${amount} · ${plural(days, "1 día vencida", `${days} días vencida`)}`] as [string, string],
    reminded: (client: string, invoice: string, amount: string) => [`Recordatorio enviado a ${client}`, `Factura ${invoice} · ${amount}`] as [string, string],
    remind: "Recordar",
    see: "Ver",
    pay: (vendor: string, amount: string, when: string) => [`Paga a ${vendor}`, `${amount} · ${when}`] as [string, string],
    payBtn: "Pagar",
    due: {
      late: (d: number) => `venció hace ${plural(d, "1 día", `${d} días`)}`,
      today: "vence hoy",
      tomorrow: "vence mañana",
      weekday: (day: string) => `vence el ${day}`,
      date: (date: string) => `vence el ${date}`,
    },
    close: (period: string) => [`Cierra ${period}`, "Cuadra tu estado de cuenta con lo que tienes registrado"] as [string, string],
    closePeriod: (to: string) => `hasta el ${to}`,
    open: "Abrir",
    connectBank: ["Conecta tu banco", "Tus movimientos llegan solos y la app los ordena."] as [string, string],
    connect: "Conectar",
    taxDocs: ["Sube tus documentos de impuestos", "Tu preparador empieza cuando los tenga."] as [string, string],
    taxW2: "Tus 1099 llegan a más tardar el 31 de enero. Súbelos cuando te lleguen.",
    taxLast: (n: number, day: string) => [n === 0 ? "Hoy es el último día para declarar" : n === 1 ? "Mañana es el último día para declarar" : `Faltan ${n} días para declarar`, `La fecha límite es el ${day}. Sube tus documentos.`] as [string, string],
    taxRedo: (n: number) => [`Tu preparador te pidió ${plural(n, "1 documento", `${n} documentos`)}`, "Súbelo de nuevo desde Impuestos."] as [string, string],
    receipts: (left: number) => [`Te ${plural(left, "queda 1 foto", `quedan ${left} fotos`)} de recibo este mes`, "Tu plan Básico incluye 20 al mes."] as [string, string],
    upload: "Subir",
    allDone: ["Todo al día", "No hay nada urgente por ahora."] as [string, string],
  },
  /** The e-mail or text message "Recordar" opens, addressed to the client. */
  reminder: {
    subject: (invoice: string) => `Recordatorio: factura ${invoice}`,
    body: (client: string, invoice: string, amount: string, dueDate: string, from: string) =>
      `Hola${client ? `, ${client}` : ""}:\n\nTe escribo para recordarte la factura ${invoice} por ${amount}, que venció el ${dueDate}. Si ya la pagaste, gracias y no hagas caso a este mensaje.\n\nSaludos${from ? `,\n${from}` : "."}`,
  },
  forecast: {
    title: "En 30 días tendrás",
    in: "Entra",
    out: "Sale",
    pending: "Por cobrar",
    invoice: (client: string) => `${client} · factura`,
    recurring: (client: string) => `${client} · factura recurrente`,
    noClient: "Cliente sin nombre",
    habitualWhen: "En 30 días",
    habitual: "Gastos habituales (como los últimos 30 días)",
    more: (n: number) => `y ${plural(n, "1 más", `${n} más`)}`,
    tip: (client: string, amount: string) => `Si ${client} paga su factura vencida, tendrás ${amount} más.`,
    noBank: "Conecta tu banco para saber cuánto tendrás.",
    empty: "No hay cobros ni pagos con fecha en los próximos 30 días.",
  },
  monthExpenses: { title: "Gastos del mes", none: "Todavía no hay gastos este mes." },
  week: {
    title: "Ventas de la semana",
    vs: (pct: string) => `${pct} vs. la pasada`,
    best: (day: string, amount: string) => `Ventas por día: la más alta el ${day}, ${amount}`,
    none: "Sin ventas en los últimos 7 días",
  },
  insight: {
    title: "Esto notamos",
    up: (pct: number, category: string, month: string) => `Este mes gastaste ${pct}% más en ${category} que a estas alturas de ${month}.`,
    top: (category: string, amount: string) => `Tu gasto más grande este mes es ${category}: ${amount}.`,
    merchant: (amount: string) => ` fue tu proveedor principal (${amount}).`,
    client: (client: string, amount: string, n: number) => `Tu mejor cliente este mes es ${client}: ${amount} en ${n} ventas.`,
    none: "Cuando tengas ventas y gastos este mes, aquí te contamos lo que notemos.",
    seeExpenses: "Ver gastos",
    seeVendors: "Ver proveedores",
    seeClients: "Ver clientes",
    /** The category bill payments are saved under. */
    vendorsCategory: "Pagos a proveedores",
  },
  member: {
    sub: (business: string, role: string) => `${business} · tu rol: ${role}`,
    canDo: "Lo que puedes hacer aquí",
    month: "Para revisar este mes",
    movements: (n: number, owner: string) => [`${plural(n, "1 movimiento", `${n} movimientos`)} por revisar`, `${owner || "El dueño"} los confirma; tú los ves`] as [string, string],
    bankClear: ["Banco al día", "No hay movimientos por revisar"] as [string, string],
    reports: (month: string) => [`Reportes de ${month}`, "PDF y Excel con fórmulas"] as [string, string],
    reportsPlain: (month: string) => [`Reportes de ${month}`, "Ventas, gastos y ganancia"] as [string, string],
    todayTitle: "Hoy",
    review: "Ver",
    download: "Descargar",
  },
  error: "No pudimos cargar tu resumen.",
  retry: "Intentar de nuevo",
};

export type HomeCopy = typeof es;

const withNameEn = (name: string, rest: string) => (name ? `${name}, ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1));

const en: HomeCopy = {
  hello: (name: string) => (name ? `Hi, ${name}` : "Hi"),
  date: (weekday: string, day: number, month: string) => `${weekday}, ${month} ${day}`,
  newInvoice: "New invoice",
  charge: "Checkout",
  status: {
    good: (name: string, left: string, pct: number | null, month: string): Status => [
      `${name ? `You're doing well, ${name}` : "You're doing well"}: this month you have `, left,
      pct === null ? " left." : pct === 0 ? ` left, the same as at this point in ${month}.` : ` left, ${pct}% more than at this point in ${month}.`,
    ],
    down: (name: string, left: string, pct: number, month: string): Status => [
      withNameEn(name, "this month you have "), left, ` left, ${pct}% less than at this point in ${month}.`,
    ],
    loss: (name: string, amount: string): Status => [`${name ? `Heads up, ${name}` : "Heads up"}: this month you've spent `, amount, " more than you've sold."],
    empty: "Once you record sales or expenses this month, you'll see how you're doing here.",
  },
  kpi: {
    bank: "In the bank",
    accounts: (n: number) => plural(n, "1 account", `${n} accounts`),
    bankNone: "Connect your bank",
    owed: "Owed to you",
    owedSub: (n: number, late: number) => (n === 0 ? "Nothing to collect" : `${plural(n, "1 invoice", `${n} invoices`)}${late ? ` · ${late} overdue` : ""}`),
    today: "Today's sales",
    todaySub: (n: number) => plural(n, "1 sale", `${n} sales`),
    owe: "You owe",
    oweSub: (n: number, late: number) => (n === 0 ? "Nothing to pay" : `${n} to pay${late ? ` · ${late} overdue` : ""}`),
    monthExp: "This month's expenses",
    monthExpSub: (n: number) => plural(n, "1 expense", `${n} expenses`),
    profit: (month: string) => `${month} profit`,
    vs: (pct: string, month: string) => `${pct} vs. ${month}`,
    profitSub: (sales: string, exp: string) => `${sales} in sales − ${exp} in expenses`,
    vsTitle: (from: string, to: string) => `Compared with what you had from ${from} to ${to}`,
  },
  shortcuts: { pos: "Checkout", invoice: "New invoice", expense: "Expense", receipt: "Receipt photo" },
  locked: "Not in your plan",
  today: {
    title: "For today",
    tag: "Most urgent first",
  },
  tasks: {
    review: (n: number) => [`Review ${plural(n, "1 transaction", `${n} transactions`)}`, `${plural(n, "It's approved", `${n} are approved`)} in one click`],
    reviewBtn: "Review",
    collect: (client: string, invoice: string, amount: string, days: number) => [`Collect from ${client}`, `Invoice ${invoice} · ${amount} · ${plural(days, "1 day", `${days} days`)} overdue`],
    reminded: (client: string, invoice: string, amount: string) => [`Reminder sent to ${client}`, `Invoice ${invoice} · ${amount}`],
    remind: "Remind",
    see: "View",
    pay: (vendor: string, amount: string, when: string) => [`Pay ${vendor}`, `${amount} · ${when}`],
    payBtn: "Pay",
    due: {
      late: (d: number) => `was due ${plural(d, "1 day", `${d} days`)} ago`,
      today: "due today",
      tomorrow: "due tomorrow",
      weekday: (day: string) => `due ${day}`,
      date: (date: string) => `due ${date}`,
    },
    close: (period: string) => [`Close ${period}`, "Match your bank statement with your records"],
    closePeriod: (to: string) => `through ${to}`,
    open: "Open",
    connectBank: ["Connect your bank", "Your transactions arrive on their own and the app sorts them."],
    connect: "Connect",
    taxDocs: ["Upload your tax documents", "Your preparer starts once they have them."],
    taxW2: "Your 1099s arrive by January 31. Upload them when they come.",
    taxLast: (n: number, day: string) => [n === 0 ? "Today is the last day to file" : n === 1 ? "Tomorrow is the last day to file" : `${n} days left to file`, `The deadline is ${day}. Upload your documents.`],
    taxRedo: (n: number) => [`Your preparer asked for ${plural(n, "1 document", `${n} documents`)}`, "Upload it again from Taxes."],
    receipts: (left: number) => [`${plural(left, "1 receipt photo", `${left} receipt photos`)} left this month`, "Your Basic plan includes 20 a month."],
    upload: "Upload",
    allDone: ["All caught up", "Nothing urgent right now."],
  },
  reminder: {
    subject: (invoice: string) => `Reminder: invoice ${invoice}`,
    body: (client: string, invoice: string, amount: string, dueDate: string, from: string) =>
      `Hi${client ? ` ${client}` : ""},\n\nThis is a friendly reminder about invoice ${invoice} for ${amount}, which was due on ${dueDate}. If you've already paid it, thank you, and please ignore this message.\n\nBest${from ? `,\n${from}` : "."}`,
  },
  forecast: {
    title: "In 30 days you'll have",
    in: "In",
    out: "Out",
    pending: "To collect",
    invoice: (client: string) => `${client} · invoice`,
    recurring: (client: string) => `${client} · recurring invoice`,
    noClient: "Unnamed client",
    habitualWhen: "Over 30 days",
    habitual: "Regular expenses (like the last 30 days)",
    more: (n: number) => `and ${n} more`,
    tip: (client: string, amount: string) => `If ${client} pays their overdue invoice, you'll have ${amount} more.`,
    noBank: "Connect your bank to see how much you'll have.",
    empty: "No dated payments in or out in the next 30 days.",
  },
  monthExpenses: { title: "This month's expenses", none: "No expenses this month yet." },
  week: {
    title: "This week's sales",
    vs: (pct: string) => `${pct} vs. last week`,
    best: (day: string, amount: string) => `Sales by day: highest on ${day}, ${amount}`,
    none: "No sales in the last 7 days",
  },
  insight: {
    title: "What we noticed",
    up: (pct: number, category: string, month: string) => `This month you spent ${pct}% more on ${category} than at this point in ${month}.`,
    top: (category: string, amount: string) => `Your biggest expense this month is ${category}: ${amount}.`,
    merchant: (amount: string) => ` was your top vendor (${amount}).`,
    client: (client: string, amount: string, n: number) => `Your best client this month is ${client}: ${amount} in ${n} sales.`,
    none: "Once you have sales and expenses this month, we'll tell you what we notice here.",
    seeExpenses: "See expenses",
    seeVendors: "See vendors",
    seeClients: "See clients",
    vendorsCategory: "Vendor payments",
  },
  member: {
    sub: (business: string, role: string) => `${business} · your role: ${role}`,
    canDo: "What you can do here",
    month: "To review this month",
    movements: (n: number, owner: string) => [`${plural(n, "1 transaction", `${n} transactions`)} to review`, `${owner || "The owner"} confirms them; you see them`],
    bankClear: ["Bank up to date", "No transactions to review"],
    reports: (month: string) => [`${month} reports`, "PDF and Excel with formulas"],
    reportsPlain: (month: string) => [`${month} reports`, "Sales, expenses and profit"],
    todayTitle: "Today",
    review: "View",
    download: "Download",
  },
  error: "We couldn't load your summary.",
  retry: "Try again",
};

export const homeCopy: Record<Lang, HomeCopy> = { es, en };
