// Copy for the 2.0 personal home (src/pages/PersonalDashboard.tsx).
import type { Lang } from "../lang";

const es = {
  hello: (name: string) => (name ? `Hola, ${name}` : "Hola"),
  myReturn: "Mi declaración",
  status: (month: string, inc: string, out: string, saved: string, up: boolean) =>
    up
      ? `En ${month} entraron ${inc} y salieron ${out}: te quedaron ${saved}.`
      : `En ${month} entraron ${inc} y salieron ${out}: gastaste ${saved} más de lo que entró.`,
  statusEmpty: (month: string) => `Todavía no hay movimientos en ${month}. Cuando lleguen, aquí verás cómo va tu mes.`,
  kpi: {
    balance: "Disponible",
    balanceSub: (n: number) => (n === 1 ? "En 1 cuenta" : `En ${n} cuentas`),
    income: "Entró este mes",
    expense: "Salió este mes",
    count: (n: number) => (n === 1 ? "1 movimiento" : `${n} movimientos`),
    saved: "Te quedó",
    savedSub: (pct: number) => `${pct}% de lo que entró`,
    overspent: "Gastaste de más",
    overspentSub: "Salió más de lo que entró",
  },
  shortcuts: { goals: "Metas", budgets: "Presupuestos", subscriptions: "Suscripciones", assistant: "Pregúntale al asistente" },
  locked: "Tu plan no lo incluye",
  attention: {
    title: "Para tener en cuenta",
    over: (cat: string, amount: string) => [`Te pasaste en ${cat}`, `${amount} por encima de tu presupuesto`] as [string, string],
    near: (cat: string, pct: number) => [`${cat} va en ${pct}%`, "Estás cerca de tu límite del mes"] as [string, string],
    taxRedo: (n: number) => [`Tu preparador te pidió ${n === 1 ? "1 documento" : `${n} documentos`}`, "Súbelo de nuevo desde Mi declaración."] as [string, string],
    taxDocs: ["Sube tus documentos de impuestos", "Tu preparador empieza cuando los tenga."] as [string, string],
    noBudgets: ["Ponle un límite a lo que más gastas", "Te avisamos aquí cuando estés cerca."] as [string, string],
    allGood: ["Todo en orden", "No hay nada que revisar por ahora."] as [string, string],
    open: "Abrir",
  },
  spending: {
    title: "¿En qué se va tu dinero?",
    none: "Aún no hay gastos este mes.",
    of: (pct: number) => `${pct}% de lo que salió`,
  },
  goals: {
    title: "Tus metas",
    all: "Ver metas",
    none: "Todavía no tienes metas.",
    create: "Crear una meta",
    progress: (saved: string, target: string) => `${saved} de ${target}`,
    done: "¡Lograda!",
  },
  recent: { title: "Movimientos recientes", all: "Ver todo", none: "Aún no hay movimientos este mes." },
  connect: {
    title: "Conecta tu banco y la app hace el resto",
    text: "Tus movimientos llegan solos, ordenados por categoría, y aquí ves cuánto entra, cuánto sale y en qué se va.",
    points: ["Lo hace Plaid: nunca vemos tu contraseña", "Solo lectura: nadie puede mover tu dinero desde la app", "Puedes desconectarlo cuando quieras"],
    button: "Conectar mi banco",
    taxTitle: "Tu declaración",
    taxText: "Sube tus documentos y tu preparador la hace por ti, sin costo.",
    taxButton: "Ir a Mi declaración",
  },
};

export type PersonalHomeCopy = typeof es;

const en: PersonalHomeCopy = {
  hello: (name: string) => (name ? `Hi, ${name}` : "Hi"),
  myReturn: "My tax return",
  status: (month: string, inc: string, out: string, saved: string, up: boolean) =>
    up
      ? `In ${month}, ${inc} came in and ${out} went out: you kept ${saved}.`
      : `In ${month}, ${inc} came in and ${out} went out: you spent ${saved} more than came in.`,
  statusEmpty: (month: string) => `No transactions in ${month} yet. When they arrive, you'll see how your month is going here.`,
  kpi: {
    balance: "Available",
    balanceSub: (n: number) => (n === 1 ? "In 1 account" : `In ${n} accounts`),
    income: "In this month",
    expense: "Out this month",
    count: (n: number) => (n === 1 ? "1 transaction" : `${n} transactions`),
    saved: "You kept",
    savedSub: (pct: number) => `${pct}% of what came in`,
    overspent: "You overspent",
    overspentSub: "More went out than came in",
  },
  shortcuts: { goals: "Goals", budgets: "Budgets", subscriptions: "Subscriptions", assistant: "Ask the assistant" },
  locked: "Not in your plan",
  attention: {
    title: "Worth a look",
    over: (cat: string, amount: string) => [`You went over on ${cat}`, `${amount} above your budget`],
    near: (cat: string, pct: number) => [`${cat} is at ${pct}%`, "You're close to this month's limit"],
    taxRedo: (n: number) => [`Your preparer asked for ${n === 1 ? "1 document" : `${n} documents`}`, "Upload it again from My tax return."],
    taxDocs: ["Upload your tax documents", "Your preparer starts once they have them."],
    noBudgets: ["Set a limit on what you spend the most on", "We'll let you know here when you're close."],
    allGood: ["All good", "Nothing to review right now."],
    open: "Open",
  },
  spending: {
    title: "Where is your money going?",
    none: "No spending this month yet.",
    of: (pct: number) => `${pct}% of what went out`,
  },
  goals: {
    title: "Your goals",
    all: "See goals",
    none: "You don't have any goals yet.",
    create: "Create a goal",
    progress: (saved: string, target: string) => `${saved} of ${target}`,
    done: "Reached!",
  },
  recent: { title: "Recent transactions", all: "See all", none: "No transactions this month yet." },
  connect: {
    title: "Connect your bank and the app does the rest",
    text: "Your transactions arrive on their own, sorted by category, and here you see what comes in, what goes out and where it goes.",
    points: ["Plaid handles it: we never see your password", "Read-only: no one can move your money from the app", "Disconnect it whenever you want"],
    button: "Connect my bank",
    taxTitle: "Your tax return",
    taxText: "Upload your documents and your preparer files it for you, at no cost.",
    taxButton: "Go to My tax return",
  },
};

export const personalHomeCopy: Record<Lang, PersonalHomeCopy> = { es, en };
