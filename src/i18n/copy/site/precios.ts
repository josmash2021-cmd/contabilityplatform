// Copy for /precios (src/pages/site/Precios.tsx and src/components/marketing/site/Precios*).
// Plan names, prices and the plan cards come from src/i18n/copy/marketing.ts and
// src/components/marketing/content.ts; what each plan includes (the comparison table's
// ✓, — and numbers) comes from contracts/planFeatures.ts. Here only the words around them.
// Only true statements: no invented discounts, testimonials, ratings or customer counts.
import type { Lang } from "../../lang";

/** Facts the billing questions quote, taken from the plan data (never typed here). */
export type PreciosFaqData = {
  days: number;
  /** Names of the free personal plan and of the plan the trial unlocks in each group. */
  personalFree: string;
  personalTop: string;
  businessTop: string;
  /** Which plans include Impuestos, already worded (see `taxPlans`). */
  taxPlans: string;
  basic: { name: string; monthly: number; banks: number };
  pro: { name: string; monthly: number; annual: number; banks: number };
  team: { name: string; monthly: number; banks: number; users: number };
  /** Users on the business Pro plan, and the free personal plan's assistant limit (x5…). */
  proUsers: number;
  freeX: number;
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

function listEs(items: string[]) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
function listEn(items: string[]) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const es = {
  pageTitle: "Precios",
  hero: {
    eyebrow: "Precios",
    title: "Precios simples, sin sorpresas",
    /** `free`: the free personal plan's name. */
    text: (days: number, free: string) =>
      `Prueba ${days} días con acceso completo, sin tarjeta. Cuando termina la prueba, tú eliges tu plan: no hay cobros automáticos. Y si es para ti, el plan ${free} es gratis para siempre.`,
    pointsLabel: "Lo que debes saber",
    points: ["Sin tarjeta para empezar", "Sin cobros automáticos al terminar la prueba", "Cancela cuando quieras"],
    compareLink: "Compara los planes",
  },
  plans: {
    eyebrow: "Planes",
    title: "Elige el plan que necesitas hoy",
    text: (days: number) =>
      `Para ti o para tu negocio. Los planes de pago incluyen ${days} días de prueba con acceso completo, y puedes cambiar de plan desde Ajustes.`,
  },
  compare: {
    eyebrow: "Comparación",
    title: "Compara los planes",
    text: "Todo lo que incluye cada plan, función por función.",
    caption: (group: string) => `Qué incluye cada plan ${group.toLowerCase()}`,
    brand: "P&BS Plans",
    featureCol: "Funciones",
    planPicker: "Plan que quieres ver",
    included: "Incluido",
    notIncluded: "No incluido",
    tryCta: "Probar gratis",
    freeCta: "Empezar gratis",
    ctaAria: (cta: string, plan: string, group: string) => `${cta}: plan ${plan} ${group.toLowerCase()}`,
    values: {
      banks: (n: number) => (n === 1 ? "1 banco" : `Hasta ${n} bancos`),
      unlimited: "Sin límite",
      perMonth: (n: number) => `${n} al mes`,
      questions: (x: number) => `Límite x${x}`,
      users: (n: number) => (n === 1 ? "1 usuario" : `Hasta ${n} usuarios`),
    },
    sections: {
      sales: "Ventas y clientes",
      bank: "Banco y gastos",
      reports: "Reportes",
      taxes: "Impuestos",
      assistant: "Asistente de IA",
      team: "Equipo",
      support: "Soporte",
    },
    rows: {
      // Ventas y clientes
      pos: { label: "Punto de venta: efectivo, Zelle y tarjeta", hint: "" },
      clients: { label: "Clientes y catálogo de servicios", hint: "" },
      salesDashboard: { label: "Panel de ventas del día, la semana y el mes", hint: "" },
      quotes: { label: "Cotizaciones y facturas recurrentes", hint: "" },
      // Banco y gastos
      banks: { label: "Bancos conectados", hint: "Con Plaid. Cada banco puede traer tu cuenta de cheques y la de ahorros." },
      bankTransactions: { label: "Movimientos de tu banco, automáticos", hint: "" },
      autoCategories: { label: "Movimientos clasificados automáticamente", hint: "" },
      subscriptions: { label: "Detector de suscripciones y cobros recurrentes", hint: "" },
      budgets: { label: "Presupuestos por categoría con alertas", hint: "" },
      savingsGoals: { label: "Metas de ahorro con seguimiento", hint: "" },
      expenses: { label: "Registro de gastos por categoría", hint: "" },
      receipts: { label: "Fotos de recibos en tus gastos", hint: "" },
      vendors: { label: "Proveedores y facturas por pagar", hint: "" },
      // Reportes
      monthlySummary: { label: "Resumen mensual de ingresos y gastos", hint: "" },
      incomeStatement: { label: "Estado de resultados: ingresos, gastos y utilidad", hint: "" },
      accountantView: { label: "Vista para tu contador, con Excel y PDF", hint: "" },
      clientReports: { label: "Reportes por cliente y por servicio", hint: "" },
      // Impuestos
      taxDocs: { label: "Sube tus documentos de impuestos desde el teléfono", hint: "" },
      taxPrep: { label: "Tu preparador hace tu declaración, federal y estatal", hint: "Sin costo extra: la preparación está incluida en el plan." },
      taxTracking: { label: "Sigue tu declaración paso a paso", hint: "" },
      taxPast: { label: "Tus declaraciones de años pasados, siempre a la mano", hint: "" },
      // Asistente de IA
      questions: { label: "Límite del asistente", hint: "El conteo empieza de nuevo cada mes." },
      // Equipo
      users: { label: "Usuarios", hint: "Cada persona entra con su propio usuario." },
      accountantAccess: { label: "Acceso para tu contador", hint: "Tu contador entra con su propio usuario y no ocupa lugar." },
      // Soporte
      prioritySupport: { label: "Soporte prioritario", hint: "" },
    },
  },
  included: {
    eyebrow: "En todos los planes",
    title: "Todos los planes incluyen",
    text: "Lo que no cambia, elijas el plan que elijas.",
    /** Which plans include Impuestos, e.g. "Básico y Pro para ti; Pro y Negocio para tu negocio". */
    taxPlans: (personal: string[], business: string[]) => `${listEs(personal)} para ti; ${listEs(business)} para tu negocio`,
    items: (days: number, taxPlans: string) => [
      { title: "Conexión segura con Plaid", text: "Cuando conectas tu banco, inicias sesión dentro de Plaid: nunca vemos tu usuario ni tu contraseña, y el acceso es de solo lectura." },
      { title: "En español e inglés", text: "Sale en el idioma de tu teléfono o computadora. Dentro de la app lo cambias en Perfil." },
      { title: "En tu teléfono", text: "Funciona en el navegador de tu teléfono, tu tableta o tu computadora." },
      { title: `${days} días gratis`, text: `Cada cuenta nueva empieza con ${days} días de acceso completo. No te pedimos tarjeta.` },
      { title: "Cancela cuando quieras", text: "No hay cobros automáticos al terminar la prueba, y cancelas tu suscripción desde Ajustes, sin llamadas ni trámites." },
      { title: "Impuestos sin costo extra", text: `En los planes con Impuestos (${taxPlans}), preparar tu declaración no tiene costo extra.` },
    ],
  },
  faq: {
    eyebrow: "Pagos y planes",
    title: "Preguntas sobre precios",
    items: (d: PreciosFaqData) => [
      {
        q: "¿Cómo funciona la prueba gratis?",
        a: `Al crear tu cuenta tienes ${d.days} días con acceso completo: todo lo del plan ${d.personalTop} si la cuenta es para ti, o todo lo del plan ${d.businessTop} si es para tu negocio. No te pedimos tarjeta.`,
      },
      {
        q: "¿Qué pasa cuando termina la prueba?",
        a: `Tú eliges tu plan. Como no registras una tarjeta durante la prueba, no se cobra nada automáticamente: solo pagas si decides suscribirte. Si tu cuenta es para ti y no eliges un plan de pago, sigues con ${d.personalFree}, que es gratis. Si es para tu negocio, eliges un plan para seguir usándola.`,
      },
      {
        q: "¿Qué cambia entre pagar mensual o anual?",
        a: `Es el mismo plan; solo cambia cómo pagas. Con el pago anual pagas el equivalente a 10 meses y tienes 12: 2 meses gratis. Por ejemplo, ${d.pro.name} para tu negocio cuesta ${usd(d.pro.monthly)} al mes o ${usd(d.pro.annual)} al año.`,
      },
      {
        q: "¿Puedo cambiar de plan?",
        a: "Sí. Cambias de plan desde Ajustes, en tu cuenta. Si un día necesitas más bancos, más usuarios u otras funciones, pasas al plan que las incluye.",
      },
      {
        q: `¿El plan ${d.personalFree} para ti es gratis de verdad?`,
        a: `Sí. ${d.personalFree} para ti cuesta $0, para siempre, y no te pide tarjeta. Incluye Impuestos (subes tus documentos, tu preparador hace tu declaración y la sigues desde la app) y el asistente de IA con límite x${d.freeX}.`,
      },
      {
        q: "¿Cuánto cuesta preparar mi declaración de impuestos?",
        a: `Nada extra. En los planes que incluyen Impuestos (${d.taxPlans}), la preparación de tu declaración ya está incluida: no pagas aparte por ella.`,
      },
      {
        q: "¿Qué plan me conviene si trabajo solo o si tengo un equipo?",
        a: `Si trabajas solo y estás empezando, ${d.basic.name} (${usd(d.basic.monthly)} al mes) te da punto de venta, clientes y ${d.basic.banks === 1 ? "1 banco" : `hasta ${d.basic.banks} bancos`}. Si además quieres impuestos, proveedores, cotizaciones y la vista para tu contador, ${d.pro.name} (${usd(d.pro.monthly)} al mes, hasta ${d.pro.banks} bancos y hasta ${d.proUsers} usuarios, más tu contador). Si tu equipo es más grande, ${d.team.name} (${usd(d.team.monthly)} al mes) suma hasta ${d.team.users} usuarios, hasta ${d.team.banks} bancos y reportes por cliente y por servicio.`,
      },
      {
        q: "¿Puedo cancelar cuando quiera?",
        a: "Sí. Cancelas tu suscripción desde Ajustes, sin llamadas ni trámites.",
      },
      {
        q: "¿En qué moneda son los precios y cómo pago?",
        a: "Los precios están en dólares estadounidenses (USD). Los pagos se procesan con Stripe.",
      },
    ],
    more: "¿Tienes otra pregunta?",
    moreLink: "Ver todas las preguntas frecuentes",
  },
};

export type PreciosCopy = typeof es;

const en: PreciosCopy = {
  pageTitle: "Pricing",
  hero: {
    eyebrow: "Pricing",
    title: "Simple pricing, no surprises",
    text: (days: number, free: string) =>
      `Try it for ${days} days with full access, no card required. When the trial ends, you choose your plan: there are no automatic charges. And if it's for you, the ${free} plan is free forever.`,
    pointsLabel: "Good to know",
    points: ["No card to start", "No automatic charges when the trial ends", "Cancel anytime"],
    compareLink: "Compare plans",
  },
  plans: {
    eyebrow: "Plans",
    title: "Pick the plan you need today",
    text: (days: number) =>
      `For you or for your business. Paid plans include a ${days}-day trial with full access, and you can change plans from Settings.`,
  },
  compare: {
    eyebrow: "Comparison",
    title: "Compare plans",
    text: "Everything each plan includes, feature by feature.",
    caption: (group: string) => `What each plan includes, ${group.toLowerCase()}`,
    brand: "P&BS Plans",
    featureCol: "Features",
    planPicker: "Plan to show",
    included: "Included",
    notIncluded: "Not included",
    tryCta: "Try for free",
    freeCta: "Start for free",
    ctaAria: (cta: string, plan: string, group: string) => `${cta}: ${plan} plan ${group.toLowerCase()}`,
    values: {
      banks: (n: number) => (n === 1 ? "1 bank" : `Up to ${n} banks`),
      unlimited: "Unlimited",
      perMonth: (n: number) => `${n} a month`,
      questions: (x: number) => `Limit x${x}`,
      users: (n: number) => (n === 1 ? "1 user" : `Up to ${n} users`),
    },
    sections: {
      sales: "Sales and clients",
      bank: "Bank and expenses",
      reports: "Reports",
      taxes: "Taxes",
      assistant: "AI assistant",
      team: "Team",
      support: "Support",
    },
    rows: {
      pos: { label: "Point of sale: cash, Zelle and card", hint: "" },
      clients: { label: "Clients and service catalog", hint: "" },
      salesDashboard: { label: "Daily, weekly and monthly sales dashboard", hint: "" },
      quotes: { label: "Quotes and recurring invoices", hint: "" },
      banks: { label: "Connected banks", hint: "Through Plaid. Each bank can bring your checking and savings accounts." },
      bankTransactions: { label: "Your bank transactions, automatically", hint: "" },
      autoCategories: { label: "Transactions categorized automatically", hint: "" },
      subscriptions: { label: "Subscription and recurring charge finder", hint: "" },
      budgets: { label: "Category budgets with alerts", hint: "" },
      savingsGoals: { label: "Savings goals with progress tracking", hint: "" },
      expenses: { label: "Expense tracking by category", hint: "" },
      receipts: { label: "Receipt photos on your expenses", hint: "" },
      vendors: { label: "Vendors and bills to pay", hint: "" },
      monthlySummary: { label: "Monthly income and spending summary", hint: "" },
      incomeStatement: { label: "Income statement: income, expenses and profit", hint: "" },
      accountantView: { label: "Accountant view, with Excel and PDF", hint: "" },
      clientReports: { label: "Reports by client and by service", hint: "" },
      taxDocs: { label: "Upload your tax documents from your phone", hint: "" },
      taxPrep: { label: "Your tax preparer files your return, federal and state", hint: "No extra cost: preparation is included in the plan." },
      taxTracking: { label: "Follow your return step by step", hint: "" },
      taxPast: { label: "Your past years' returns, always at hand", hint: "" },
      questions: { label: "Assistant limit", hint: "The count starts over every month." },
      users: { label: "Users", hint: "Each person logs in with their own account." },
      accountantAccess: { label: "Access for your accountant", hint: "Your accountant logs in with their own account and doesn't take a seat." },
      prioritySupport: { label: "Priority support", hint: "" },
    },
  },
  included: {
    eyebrow: "In every plan",
    title: "Every plan includes",
    text: "What stays the same, whichever plan you pick.",
    taxPlans: (personal: string[], business: string[]) => `${listEn(personal)} for you; ${listEn(business)} for your business`,
    items: (days: number, taxPlans: string) => [
      { title: "Secure connection with Plaid", text: "When you connect your bank, you log in inside Plaid: we never see your username or password, and access is read-only." },
      { title: "In English and Spanish", text: "It shows in your phone or computer's language. Inside the app you can change it in Profile." },
      { title: "On your phone", text: "Works in the browser on your phone, tablet or computer." },
      { title: `${days} days free`, text: `Every new account starts with ${days} days of full access. We don't ask for a card.` },
      { title: "Cancel anytime", text: "There are no automatic charges when the trial ends, and you cancel your subscription from Settings, no calls or paperwork." },
      { title: "Taxes at no extra cost", text: `On the plans with Taxes (${taxPlans}), having your return prepared costs nothing extra.` },
    ],
  },
  faq: {
    eyebrow: "Billing and plans",
    title: "Pricing questions",
    items: (d: PreciosFaqData) => [
      {
        q: "How does the free trial work?",
        a: `When you create your account you get ${d.days} days of full access: everything in the ${d.personalTop} plan if the account is for you, or everything in the ${d.businessTop} plan if it's for your business. We don't ask for a card.`,
      },
      {
        q: "What happens when the trial ends?",
        a: `You choose your plan. Since you don't add a card during the trial, nothing is charged automatically: you only pay if you decide to subscribe. If your account is for you and you don't pick a paid plan, you stay on ${d.personalFree}, which is free. If it's for your business, you pick a plan to keep using it.`,
      },
      {
        q: "What's the difference between paying monthly or yearly?",
        a: `It's the same plan; only the way you pay changes. With yearly billing you pay the equivalent of 10 months and get 12: 2 months free. For example, ${d.pro.name} for your business costs ${usd(d.pro.monthly)} a month or ${usd(d.pro.annual)} a year.`,
      },
      {
        q: "Can I change plans?",
        a: "Yes. You change plans from Settings, in your account. If one day you need more banks, more users or other features, you move to the plan that includes them.",
      },
      {
        q: `Is the ${d.personalFree} plan for you really free?`,
        a: `Yes. ${d.personalFree} for you costs $0, forever, and doesn't ask for a card. It includes Taxes (you upload your documents, your tax preparer files your return and you follow it in the app) and the AI assistant with a x${d.freeX} limit.`,
      },
      {
        q: "How much does it cost to have my tax return prepared?",
        a: `Nothing extra. On the plans that include Taxes (${d.taxPlans}), preparing your return is already included: you don't pay separately for it.`,
      },
      {
        q: "Which plan fits me if I work alone or have a team?",
        a: `If you work alone and are getting started, ${d.basic.name} (${usd(d.basic.monthly)} a month) gives you point of sale, clients and ${d.basic.banks === 1 ? "1 bank" : `up to ${d.basic.banks} banks`}. If you also want taxes, vendors, quotes and the accountant view, ${d.pro.name} (${usd(d.pro.monthly)} a month, up to ${d.pro.banks} banks and up to ${d.proUsers} users, plus your accountant). If your team is bigger, ${d.team.name} (${usd(d.team.monthly)} a month) adds up to ${d.team.users} users, up to ${d.team.banks} banks and reports by client and by service.`,
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. You cancel your subscription from Settings, no calls or paperwork.",
      },
      {
        q: "What currency are prices in, and how do I pay?",
        a: "Prices are in US dollars (USD). Payments are processed by Stripe.",
      },
    ],
    more: "Have another question?",
    moreLink: "See all frequently asked questions",
  },
};

export const preciosCopy: Record<Lang, PreciosCopy> = { es, en };
