// Copy for the /preguntas page (src/pages/site/Preguntas.tsx, src/components/marketing/site/Preguntas*).
// Numbers (prices, limits, trial days) come in as `facts`, built from contracts/planFeatures.ts,
// contracts/taxRules.ts and src/components/marketing/content.ts, so the answers can't drift from the product.
// Only answer with what the product does today.
import type { Lang } from "../../lang";

type Price = { monthly: number; annual: number };

/** The product's numbers the answers quote. */
export type PreguntasFacts = {
  days: number;
  prices: { personalPro: Price; basic: Price; pro: Price; business: Price };
  /** Assistant questions a month per plan, and how many questions one "x" is. */
  questions: { perX: number; personalBasic: number; personalPro: number; basic: number; pro: number; business: number };
  /** Banks a business plan can connect (personal has no limit). */
  banks: { basic: number; pro: number; business: number };
  /** Users on the Negocio plan, the owner included (the accountant is extra). */
  seats: { pro: number; business: number };
  maxFileMb: number;
  inviteDays: number;
};

/** A paragraph, or a list of short points. */
export type PreguntasBlock = string | string[];
export type PreguntasItem = {
  q: string;
  a: PreguntasBlock[];
  /** Other words people may search with (not shown). */
  k?: string;
};
export type PreguntasCategoryId = "start" | "plans" | "bank" | "taxes" | "assistant" | "team" | "security" | "personal";
export type PreguntasCategory = {
  id: PreguntasCategoryId;
  title: string;
  /** Label for the category chips. */
  short: string;
  items: PreguntasItem[];
  more?: { label: string; to: string };
};

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
/** "x5" from 100 questions. */
const xOf = (questions: number, perX: number) => `x${Math.round(questions / perX)}`;

const es = {
  pageTitle: "Preguntas frecuentes",
  hero: {
    eyebrow: "Preguntas frecuentes",
    title: "¿En qué te podemos ayudar?",
    text: "Respuestas claras sobre la prueba gratis, los planes, tu banco, tus impuestos, el asistente y la seguridad de tus datos.",
    secondary: "Ver precios",
  },
  search: {
    label: "Buscar en las preguntas frecuentes",
    placeholder: "Busca: precio, Plaid, impuestos…",
    clear: "Borrar búsqueda",
    found: (n: number) => (n === 0 ? "Ninguna pregunta encontrada" : n === 1 ? "1 pregunta encontrada" : `${n} preguntas encontradas`),
  },
  jumpLabel: "Ir a una categoría",
  sideLabel: "Categorías",
  resultsLabel: "Preguntas y respuestas",
  count: (n: number) => (n === 1 ? "1 pregunta" : `${n} preguntas`),
  empty: {
    title: (q: string) => `No encontramos nada sobre «${q}»`,
    text: "Prueba con otra palabra o con una de estas:",
    suggestions: ["precio", "Plaid", "impuestos", "contador"],
    clear: "Borrar búsqueda",
  },
  categories: (f: PreguntasFacts): PreguntasCategory[] => [
    {
      id: "start",
      title: "Empezar y prueba gratis",
      short: "Empezar",
      items: [
        {
          q: "¿Cómo funciona la prueba gratis?",
          a: [
            `Al crear tu cuenta tienes ${f.days} días con acceso completo: todo lo del plan más completo de tu tipo de cuenta (Pro si es Personal, Negocio si es para tu negocio).`,
            "No te pedimos tarjeta para empezar.",
          ],
          k: "trial probar gratis dias",
        },
        {
          q: "¿Qué pasa cuando terminan los días de prueba?",
          a: [
            "Eliges tu plan en Ajustes. Si tu cuenta es Personal, sigues gratis con el plan Básico: tus impuestos y el asistente. Si es de Negocio, eliges Básico, Pro o Negocio para seguir usándola.",
            "Tu información sigue guardada.",
          ],
          k: "termina vence prueba despues",
        },
        {
          q: "¿Necesito tarjeta de crédito?",
          a: ["No. Creas tu cuenta solo con tu nombre, tu correo y una contraseña. Solo pagas si decides suscribirte, y lo haces en la página segura de Stripe."],
          k: "tarjeta credito debito registro",
        },
        {
          q: "¿Personal o Negocio: cuál elijo?",
          a: [
            "Negocio es para cobrar y llevar las cuentas de tu negocio: punto de venta, clientes, gastos, banco y reportes de ingresos, gastos y utilidad.",
            "Personal es para el dinero de tu casa: tus movimientos, tus suscripciones, tus metas de ahorro y tus impuestos.",
            "Lo eliges al crear tu cuenta.",
          ],
          k: "diferencia modo tipo de cuenta",
        },
        {
          q: "¿Necesito saber de contabilidad?",
          a: ["No. La app organiza tus números por ti y te los muestra en reportes fáciles de leer, sin palabras de contador."],
          k: "contador facil",
        },
        {
          q: "¿Tengo que instalar algo? ¿Está en inglés?",
          a: [
            "No tienes que instalar nada: funciona en el navegador de tu celular o de tu computadora.",
            "Está en español y en inglés. Se muestra en el idioma de tu dispositivo y lo puedes cambiar cuando quieras.",
          ],
          k: "app celular telefono idioma ingles español",
        },
      ],
    },
    {
      id: "plans",
      title: "Planes y pagos",
      short: "Planes y pagos",
      more: { label: "Ver todos los precios", to: "/precios" },
      items: [
        {
          q: "¿Cuánto cuestan los planes?",
          a: [
            "Para ti:",
            ["Básico: gratis, para siempre.", `Pro: ${usd(f.prices.personalPro.monthly)} al mes o ${usd(f.prices.personalPro.annual)} al año.`],
            "Para tu negocio:",
            [
              `Básico: ${usd(f.prices.basic.monthly)} al mes o ${usd(f.prices.basic.annual)} al año.`,
              `Pro: ${usd(f.prices.pro.monthly)} al mes o ${usd(f.prices.pro.annual)} al año.`,
              `Negocio: ${usd(f.prices.business.monthly)} al mes o ${usd(f.prices.business.annual)} al año.`,
            ],
            "Precios en dólares (USD).",
          ],
          k: "precio costo cuanto cuesta mensual",
        },
        {
          q: "¿El plan anual tiene descuento?",
          a: [`Sí: con el plan anual te llevas 2 meses gratis. Por ejemplo, Pro para tu negocio cuesta ${usd(f.prices.pro.annual)} al año en vez de ${usd(f.prices.pro.monthly * 12)}.`],
          k: "anual año ahorro descuento",
        },
        {
          q: "¿Me van a cobrar cuando termine la prueba?",
          a: ["No. Como no registras una tarjeta durante la prueba, no hay cobros automáticos. Solo pagas si tú decides suscribirte."],
          k: "cobro automatico sorpresa",
        },
        {
          q: "¿Cómo cambio de plan?",
          a: ["En Ajustes (en el modo Personal se llama Perfil), en la parte de Suscripción, eliges el plan que quieres y pagas en la página segura de Stripe."],
          k: "subir bajar cambiar plan ajustes",
        },
        {
          q: "¿Puedo cancelar cuando quiera?",
          a: ["Sí, desde Ajustes, sin llamadas ni trámites. Sigues con acceso hasta que termine el periodo que ya pagaste."],
          k: "cancelar suscripcion",
        },
        {
          q: "¿Cómo pago y cómo cambio mi tarjeta?",
          a: ["Pagas en la página segura de Stripe; tu tarjeta no pasa por nuestros servidores. Para cambiar tu tarjeta, Ajustes te lleva al portal de Stripe."],
          k: "pago tarjeta stripe factura",
        },
      ],
    },
    {
      id: "bank",
      title: "Banco y Plaid",
      short: "Banco y Plaid",
      items: [
        {
          q: "¿Es seguro conectar mi banco?",
          a: [
            "Sí. La conexión se hace con Plaid: inicias sesión en tu banco dentro de la ventana de Plaid y nosotros nunca vemos ni guardamos tu usuario ni tu contraseña.",
            "El acceso es de solo lectura: trae tus movimientos y saldos, y desde la app nadie puede mover tu dinero.",
          ],
          k: "seguridad contraseña banco",
        },
        {
          q: "¿Qué bancos puedo conectar?",
          a: ["La mayoría de bancos y cooperativas de crédito de Estados Unidos que funcionan con Plaid, como Chase, Bank of America o Wells Fargo."],
          k: "chase wells fargo bank of america credit union cooperativa",
        },
        {
          q: "¿Cuántos bancos puedo conectar?",
          a: [
            "En Personal Pro, los que quieras.",
            `Para tu negocio: Básico, ${f.banks.basic}; Pro, hasta ${f.banks.pro}; Negocio, hasta ${f.banks.business}.`,
          ],
          k: "cuentas varios bancos limite",
        },
        {
          q: "¿Cuántos movimientos trae?",
          a: [
            "Al conectar, le pedimos a tu banco hasta 2 años de movimientos. Cuántos llegan depende de tu banco.",
            "Después, los movimientos nuevos llegan solos cuando abres la app.",
          ],
          k: "historial transacciones meses",
        },
        {
          q: "¿Los movimientos se clasifican solos?",
          a: ["Sí. Cada movimiento llega ya clasificado por categoría, como comida, gasolina o renta. No tienes que capturar nada a mano."],
          k: "categorias clasificar automatico",
        },
        {
          q: "¿Cómo desconecto mi banco?",
          a: [
            ["Negocio: en el menú, entra a Banco, toca Desconectar y confirma.", "Personal: en Inicio, toca Desconectar banco."],
            "Al desconectar, borramos de la app la conexión y los movimientos que trajo tu banco.",
          ],
          k: "quitar banco desconectar",
        },
      ],
    },
    {
      id: "taxes",
      title: "Impuestos",
      short: "Impuestos",
      items: [
        {
          q: "¿Cuánto cuesta preparar mi declaración?",
          a: [
            "Nada aparte. La preparación va incluida en los planes con Impuestos: Básico para ti (que es gratis), Pro para ti, y Pro y Negocio para tu negocio.",
            "El plan Básico para negocio no incluye Impuestos.",
          ],
          k: "taxes precio preparacion gratis costo",
        },
        {
          q: "¿Qué declaraciones preparan?",
          a: ["Tu declaración federal (IRS) y la del estado de Alabama. Por ahora, Alabama es el único estado."],
          k: "federal estatal irs alabama estado",
        },
        {
          q: "¿Qué documentos necesito?",
          a: [
            "La app te dice exactamente cuáles según tus respuestas. Lo más común:",
            [
              "Una identificación con foto.",
              "Tu tarjeta del Seguro Social o tu ITIN.",
              "Tus ingresos: W‑2, 1099 o talones de pago.",
              "Según tu caso: los datos de tu pareja y de tus dependientes, el 1098 de tu hipoteca o el 1095‑A del Marketplace.",
            ],
            "Si es para tu negocio, también te podemos pedir tus 1099‑NEC o 1099‑K, tu nómina (W‑2 y 941) o las millas de tu vehículo.",
          ],
          k: "w2 w-2 1099 itin seguro social documentos papeles",
        },
        {
          q: "¿Cómo subo mis documentos?",
          a: [
            `Desde tu celular: les tomas foto o subes el PDF (JPG, PNG, WEBP, HEIC o PDF, de hasta ${f.maxFileMb} MB cada uno).`,
            "Se guardan cifrados y solo los abren tú y tu preparador.",
          ],
          k: "subir foto pdf archivo",
        },
        {
          q: "¿Cómo sé en qué va mi declaración?",
          a: [
            "En Impuestos ves cada paso: recibida, en revisión, preparando, lista para firmar, enviada al IRS y a Alabama, aceptada, reembolso en camino y reembolso depositado.",
            "Si tienes dudas, le escribes a tu preparador ahí mismo.",
          ],
          k: "seguimiento estado reembolso refund preparador mensaje",
        },
        {
          q: "¿Dónde quedan mis declaraciones de otros años?",
          a: ["En Impuestos, en Años pasados: ahí tienes tus declaraciones y tus documentos de cada año."],
          k: "años pasados anteriores copia",
        },
      ],
    },
    {
      id: "assistant",
      title: "Asistente de IA",
      short: "Asistente de IA",
      items: [
        {
          q: "¿Qué hace el asistente?",
          a: [
            "Contesta preguntas sobre tu dinero usando tus propios números: cuánto vendiste este mes, en qué gastaste más o cómo vas con tus metas de ahorro.",
            "Te explica tus números con palabras sencillas y te da consejos generales.",
          ],
          k: "inteligencia artificial ia ai chat",
        },
        {
          q: "¿Cuántas preguntas puedo hacer al mes?",
          a: [
            `Cada «x» de tu plan son ${f.questions.perX} preguntas al mes:`,
            [
              `Para ti: Básico ${xOf(f.questions.personalBasic, f.questions.perX)} (${f.questions.personalBasic} preguntas) y Pro ${xOf(f.questions.personalPro, f.questions.perX)} (${f.questions.personalPro}).`,
              `Para tu negocio: Básico ${xOf(f.questions.basic, f.questions.perX)} (${f.questions.basic}), Pro ${xOf(f.questions.pro, f.questions.perX)} (${f.questions.pro}) y Negocio ${xOf(f.questions.business, f.questions.perX)} (${f.questions.business}).`,
            ],
            "El conteo vuelve a empezar cada mes. Durante la prueba gratis tienes el límite del plan más completo.",
          ],
          k: "limite cuantas preguntas x5 x10 x15 x20",
        },
        {
          q: "¿Puede cambiar o borrar algo?",
          a: ["No. El asistente solo lee tus propios datos para contestarte. No puede cambiar, borrar ni enviar nada, no puede mover tu dinero y no ve datos de otras personas."],
          k: "seguro permisos",
        },
        {
          q: "¿Me ayuda con mis impuestos?",
          a: ["Te explica tus números, pero no da asesoría de impuestos, legal o de inversiones como lo haría un profesional. Para tu declaración, pregúntale a tu preparador en Impuestos."],
          k: "consejo asesoria impuestos",
        },
        {
          q: "¿Quién ve mi conversación con el asistente?",
          a: ["Tu equipo no la ve: el chat del asistente es solo tuyo. Para contestarte, el asistente usa Claude, la inteligencia artificial de Anthropic, que recibe tu pregunta y los números que consulta."],
          k: "privacidad chat anthropic claude",
        },
      ],
    },
    {
      id: "team",
      title: "Equipo y contador",
      short: "Equipo",
      items: [
        {
          q: "¿Puedo darle acceso a mi equipo?",
          a: [
            `Sí, con Pro o Negocio: hasta ${f.seats.pro} usuarios con Pro y hasta ${f.seats.business} con Negocio, contándote a ti, más tu contador, que no ocupa lugar.`,
            "Cada persona entra con su propia cuenta y su propia contraseña.",
          ],
          k: "usuarios empleados equipo",
        },
        {
          q: "¿Cómo invito a alguien?",
          a: [`En Equipo escribes su correo y eliges qué puede hacer. Te damos un enlace de invitación para que se lo mandes; vence en ${f.inviteDays} días. La persona entra con el mismo correo al que la invitaste.`],
          k: "invitar invitacion enlace",
        },
        {
          q: "¿Qué puede hacer un empleado?",
          a: ["Cobra en el punto de venta, ve y agrega clientes, ve tus servicios y sube fotos de recibos. No ve el banco, los reportes ni los impuestos."],
          k: "empleado rol permisos",
        },
        {
          q: "¿Qué puede hacer mi contador?",
          a: ["Ve tus números para llevar tus cuentas: ventas, gastos, banco, reportes, proveedores y recibos. No puede cambiar nada."],
          k: "contador cpa rol permisos",
        },
        {
          q: "¿Hay algo que nadie de mi equipo vea?",
          a: ["Sí. Nadie de tu equipo ve tus documentos de impuestos, tu plan y tus pagos, la lista de tu equipo, tus finanzas personales ni tu chat con el asistente."],
          k: "privacidad permisos",
        },
        {
          q: "¿Cómo quito a alguien o le cambio el rol?",
          a: ["En Equipo, junto a su nombre, eliges otro rol o tocas Quitar. Desde ese momento ya no puede ver tus datos."],
          k: "quitar eliminar rol",
        },
        {
          q: "Tengo Pro: ¿cómo le paso mis números a mi contador?",
          a: ["Con Pro y Negocio tienes Para tu contador: descargas los libros del periodo en Excel o en PDF y se los mandas."],
          k: "excel pdf exportar contador",
        },
      ],
    },
    {
      id: "security",
      title: "Seguridad y datos",
      short: "Seguridad",
      more: { label: "Todo sobre seguridad", to: "/seguridad" },
      items: [
        {
          q: "¿Pueden ver la contraseña de mi banco?",
          a: ["No. Entras a tu banco dentro de Plaid, y tu usuario y tu contraseña nunca llegan a nosotros."],
          k: "plaid contraseña",
        },
        {
          q: "¿Guardan los datos de mi tarjeta?",
          a: ["No. Pagas en la página segura de Stripe y no guardamos el número de tu tarjeta."],
          k: "stripe tarjeta",
        },
        {
          q: "¿Cómo guardan mis documentos y recibos?",
          a: ["Cifrados con AES‑256‑GCM. La llave para abrirlos vive solo en el servidor, separada de la base de datos. Tus documentos de impuestos solo los abren tú y tu preparador."],
          k: "cifrado encriptado aes",
        },
        {
          q: "¿Cómo protegen mi cuenta?",
          a: ["Tu contraseña se guarda con bcrypt, un método de un solo sentido: ni nosotros podemos leerla. Si alguien intenta entrar muchas veces seguidas, pausamos los intentos por 15 minutos. Y todo viaja por una conexión cifrada (HTTPS)."],
          k: "contraseña sesion https bcrypt",
        },
        {
          q: "¿Venden mi información?",
          a: ["No. No vendemos ni compartimos tu información con otras empresas para publicidad. Lo explica nuestra política de privacidad."],
          k: "privacidad vender datos",
        },
        {
          q: "¿Puedo borrar mi cuenta?",
          a: ["Sí. Pide que la borremos como explica nuestra política de privacidad. Al borrarla, se borran también tus documentos de impuestos, tus recibos, tus proveedores, tus cotizaciones y tus movimientos del banco."],
          k: "eliminar borrar cuenta datos",
        },
      ],
    },
    {
      id: "personal",
      title: "Modo Personal",
      short: "Modo Personal",
      items: [
        {
          q: "¿Qué es el modo Personal?",
          a: ["Es la parte de la app para el dinero de tu casa: ves a dónde se va tu dinero cada mes, tus suscripciones, tus metas de ahorro y tus impuestos."],
          k: "personal finanzas casa",
        },
        {
          q: "¿Qué incluye el plan Básico gratis?",
          a: [`Tus impuestos (subes tus documentos y tu preparador hace tu declaración federal y de Alabama) y el asistente de IA con ${f.questions.personalBasic} preguntas al mes. Es gratis para siempre y no pide tarjeta.`],
          k: "gratis basico",
        },
        {
          q: "¿Qué agrega el plan Pro?",
          a: [
            `Por ${usd(f.prices.personalPro.monthly)} al mes o ${usd(f.prices.personalPro.annual)} al año, todo lo de Básico, más:`,
            [
              "Conexión segura con tu banco.",
              "Movimientos clasificados solos.",
              "Detector de suscripciones y cobros que se repiten.",
              "Metas de ahorro.",
              "Resumen de ingresos y gastos del mes.",
              "Presupuestos por categoría con alertas.",
              `Asistente con ${f.questions.personalPro} preguntas al mes.`,
            ],
          ],
          k: "pro personal precio",
        },
        {
          q: "¿Cómo funcionan los presupuestos?",
          a: ["Le pones un límite al mes a cada categoría, como comida o gasolina. En tu Inicio te avisamos cuando llegas al 80% y cuando te pasas."],
          k: "presupuesto alerta limite",
        },
        {
          q: "¿El detector de suscripciones las cancela por mí?",
          a: ["No, pero te ayuda: te muestra los cobros que se repiten y cuánto suman al mes, y te da una guía paso a paso y un correo ya escrito para cancelarlos. Cuando cancelas, lo marcas y llevas la cuenta de lo que ahorras."],
          k: "suscripciones netflix cancelar cobros recurrentes",
        },
        {
          q: "¿Qué pasa si dejo de pagar Pro?",
          a: ["Sigues con el plan Básico gratis: tus impuestos y el asistente."],
          k: "cancelar pro bajar",
        },
      ],
    },
  ],
  help: {
    title: "¿No encontraste tu respuesta?",
    text: (days: number) => `La mejor forma de resolver tus dudas es probarlo tú mismo: tienes ${days} días con todo incluido y no te pedimos tarjeta.`,
    taxes: "¿Ya tienes cuenta y tu duda es sobre tu declaración? Escríbele a tu preparador desde Impuestos.",
    register: "Crear cuenta gratis",
    login: "Iniciar sesión",
    moreLabel: "También te puede servir",
    links: [
      { label: "Cómo funciona", to: "/como-funciona" },
      { label: "Seguridad", to: "/seguridad" },
      { label: "Precios", to: "/precios" },
    ],
  },
};

export type PreguntasCopy = typeof es;

const en: PreguntasCopy = {
  pageTitle: "FAQ",
  hero: {
    eyebrow: "Frequently asked questions",
    title: "How can we help?",
    text: "Clear answers about the free trial, plans, your bank, your taxes, the assistant and the security of your data.",
    secondary: "See pricing",
  },
  search: {
    label: "Search the frequently asked questions",
    placeholder: "Search: price, Plaid, taxes…",
    clear: "Clear search",
    found: (n: number) => (n === 0 ? "No questions found" : n === 1 ? "1 question found" : `${n} questions found`),
  },
  jumpLabel: "Go to a category",
  sideLabel: "Categories",
  resultsLabel: "Questions and answers",
  count: (n: number) => (n === 1 ? "1 question" : `${n} questions`),
  empty: {
    title: (q: string) => `We couldn't find anything about “${q}”`,
    text: "Try another word, or one of these:",
    suggestions: ["price", "Plaid", "taxes", "accountant"],
    clear: "Clear search",
  },
  categories: (f: PreguntasFacts): PreguntasCategory[] => [
    {
      id: "start",
      title: "Getting started and free trial",
      short: "Getting started",
      items: [
        {
          q: "How does the free trial work?",
          a: [
            `When you create your account you get ${f.days} days of full access: everything in the most complete plan for your type of account (Pro for Personal, Business for your business).`,
            "We don't ask for a card to start.",
          ],
          k: "trial try free days",
        },
        {
          q: "What happens when the trial days are over?",
          a: [
            "You pick your plan in Settings. If your account is Personal, you keep the free Basic plan: your taxes and the assistant. If it's a Business account, you choose Basic, Pro or Business to keep using it.",
            "Your information stays saved.",
          ],
          k: "ends expires after trial",
        },
        {
          q: "Do I need a credit card?",
          a: ["No. You create your account with just your name, your email and a password. You only pay if you decide to subscribe, and you do it on Stripe's secure page."],
          k: "card credit debit sign up",
        },
        {
          q: "Personal or Business: which one should I choose?",
          a: [
            "Business is for getting paid and keeping your business's books: point of sale, clients, expenses, bank, and income, expense and profit reports.",
            "Personal is for your household money: your transactions, your subscriptions, your savings goals and your taxes.",
            "You choose when you create your account.",
          ],
          k: "difference mode account type",
        },
        {
          q: "Do I need to know accounting?",
          a: ["No. The app organizes your numbers for you and shows them in easy-to-read reports, without accountant jargon."],
          k: "accountant easy",
        },
        {
          q: "Do I need to install anything? Is it in Spanish?",
          a: [
            "You don't need to install anything: it works in the browser on your phone or your computer.",
            "It's in English and Spanish. It shows up in your device's language and you can switch whenever you like.",
          ],
          k: "app phone mobile language spanish english",
        },
      ],
    },
    {
      id: "plans",
      title: "Plans and payments",
      short: "Plans and payments",
      more: { label: "See all prices", to: "/precios" },
      items: [
        {
          q: "How much do the plans cost?",
          a: [
            "For you:",
            ["Basic: free, forever.", `Pro: ${usd(f.prices.personalPro.monthly)} a month or ${usd(f.prices.personalPro.annual)} a year.`],
            "For your business:",
            [
              `Basic: ${usd(f.prices.basic.monthly)} a month or ${usd(f.prices.basic.annual)} a year.`,
              `Pro: ${usd(f.prices.pro.monthly)} a month or ${usd(f.prices.pro.annual)} a year.`,
              `Business: ${usd(f.prices.business.monthly)} a month or ${usd(f.prices.business.annual)} a year.`,
            ],
            "Prices in US dollars (USD).",
          ],
          k: "price cost how much monthly",
        },
        {
          q: "Is there a discount for paying yearly?",
          a: [`Yes: the annual plan gives you 2 months free. For example, Pro for your business costs ${usd(f.prices.pro.annual)} a year instead of ${usd(f.prices.pro.monthly * 12)}.`],
          k: "annual yearly savings discount",
        },
        {
          q: "Will I be charged when the trial ends?",
          a: ["No. Since you don't add a card during the trial, there are no automatic charges. You only pay if you decide to subscribe."],
          k: "automatic charge surprise",
        },
        {
          q: "How do I change my plan?",
          a: ["In Settings (called Profile in Personal mode), under Subscription, pick the plan you want and pay on Stripe's secure page."],
          k: "upgrade downgrade change plan settings",
        },
        {
          q: "Can I cancel anytime?",
          a: ["Yes, from Settings, with no calls or paperwork. You keep access until the end of the period you already paid for."],
          k: "cancel subscription",
        },
        {
          q: "How do I pay, and how do I change my card?",
          a: ["You pay on Stripe's secure page; your card doesn't go through our servers. To change your card, Settings takes you to Stripe's portal."],
          k: "payment card stripe invoice",
        },
      ],
    },
    {
      id: "bank",
      title: "Bank and Plaid",
      short: "Bank and Plaid",
      items: [
        {
          q: "Is it safe to connect my bank?",
          a: [
            "Yes. The connection goes through Plaid: you log in to your bank inside the Plaid window, and we never see or store your username or password.",
            "Access is read-only: it brings in your transactions and balances, and nobody can move your money from the app.",
          ],
          k: "security password bank",
        },
        {
          q: "Which banks can I connect?",
          a: ["Most US banks and credit unions that work with Plaid, like Chase, Bank of America or Wells Fargo."],
          k: "chase wells fargo bank of america credit union",
        },
        {
          q: "How many banks can I connect?",
          a: [
            "On Personal Pro, as many as you want.",
            `For your business: Basic, ${f.banks.basic}; Pro, up to ${f.banks.pro}; Business, up to ${f.banks.business}.`,
          ],
          k: "accounts several banks limit",
        },
        {
          q: "How much history does it bring in?",
          a: [
            "When you connect, we ask your bank for up to 2 years of transactions. How many arrive depends on your bank.",
            "After that, new transactions come in on their own when you open the app.",
          ],
          k: "history transactions months",
        },
        {
          q: "Are transactions categorized automatically?",
          a: ["Yes. Each transaction arrives already sorted into a category, like food, gas or rent. You don't have to type anything in by hand."],
          k: "categories categorize automatic",
        },
        {
          q: "How do I disconnect my bank?",
          a: [
            ["Business: in the menu, go to Bank, tap Disconnect and confirm.", "Personal: on Home, tap Disconnect bank."],
            "When you disconnect, we remove the connection and the transactions your bank brought in from the app.",
          ],
          k: "remove bank disconnect",
        },
      ],
    },
    {
      id: "taxes",
      title: "Taxes",
      short: "Taxes",
      items: [
        {
          q: "How much does it cost to prepare my tax return?",
          a: [
            "Nothing extra. Preparation is included in the plans that have Taxes: Basic for you (which is free), Pro for you, and Pro and Business for your business.",
            "The Basic plan for businesses doesn't include Taxes.",
          ],
          k: "taxes price preparation free cost",
        },
        {
          q: "Which tax returns do you prepare?",
          a: ["Your federal return (IRS) and your Alabama state return. For now, Alabama is the only state."],
          k: "federal state irs alabama",
        },
        {
          q: "What documents do I need?",
          a: [
            "The app tells you exactly which ones based on your answers. The most common:",
            [
              "A photo ID.",
              "Your Social Security card or your ITIN.",
              "Your income: W‑2, 1099 or pay stubs.",
              "Depending on your situation: your spouse's and dependents' details, your mortgage 1098 or your Marketplace 1095‑A.",
            ],
            "For your business, we may also ask for your 1099‑NEC or 1099‑K, your payroll (W‑2 and 941) or your vehicle mileage.",
          ],
          k: "w2 w-2 1099 itin social security documents paperwork",
        },
        {
          q: "How do I upload my documents?",
          a: [
            `From your phone: take a photo or upload the PDF (JPG, PNG, WEBP, HEIC or PDF, up to ${f.maxFileMb} MB each).`,
            "They're stored encrypted, and only you and your tax preparer can open them.",
          ],
          k: "upload photo pdf file",
        },
        {
          q: "How do I know where my tax return is?",
          a: [
            "In Taxes you see every step: received, in review, preparing, ready to sign, filed with the IRS and Alabama, accepted, refund on its way and refund deposited.",
            "If you have questions, you can message your preparer right there.",
          ],
          k: "tracking status refund preparer message",
        },
        {
          q: "Where are my returns from other years?",
          a: ["In Taxes, under Past years: you'll find your returns and your documents for each year."],
          k: "past years previous copy",
        },
      ],
    },
    {
      id: "assistant",
      title: "AI assistant",
      short: "AI assistant",
      items: [
        {
          q: "What does the assistant do?",
          a: [
            "It answers questions about your money using your own numbers: how much you sold this month, where you spent the most or how your savings goals are going.",
            "It explains your numbers in plain words and gives you general tips.",
          ],
          k: "artificial intelligence ai chat",
        },
        {
          q: "How many questions can I ask each month?",
          a: [
            `Each "x" in your plan is ${f.questions.perX} questions a month:`,
            [
              `For you: Basic ${xOf(f.questions.personalBasic, f.questions.perX)} (${f.questions.personalBasic} questions) and Pro ${xOf(f.questions.personalPro, f.questions.perX)} (${f.questions.personalPro}).`,
              `For your business: Basic ${xOf(f.questions.basic, f.questions.perX)} (${f.questions.basic}), Pro ${xOf(f.questions.pro, f.questions.perX)} (${f.questions.pro}) and Business ${xOf(f.questions.business, f.questions.perX)} (${f.questions.business}).`,
            ],
            "The count starts over every month. During the free trial you get the limit of the most complete plan.",
          ],
          k: "limit how many questions x5 x10 x15 x20",
        },
        {
          q: "Can it change or delete anything?",
          a: ["No. The assistant only reads your own data to answer you. It can't change, delete or send anything, it can't move your money and it doesn't see anyone else's data."],
          k: "safe permissions",
        },
        {
          q: "Can it help with my taxes?",
          a: ["It explains your numbers, but it doesn't give tax, legal or investment advice the way a professional would. For your tax return, ask your preparer in Taxes."],
          k: "advice tax",
        },
        {
          q: "Who can see my conversation with the assistant?",
          a: ["Your team can't: your assistant chat is yours alone. To answer you, the assistant uses Claude, Anthropic's artificial intelligence, which receives your question and the numbers it looks up."],
          k: "privacy chat anthropic claude",
        },
      ],
    },
    {
      id: "team",
      title: "Team and accountant",
      short: "Team",
      items: [
        {
          q: "Can I give my team access?",
          a: [
            `Yes, with Pro or Business: up to ${f.seats.pro} users with Pro and up to ${f.seats.business} with Business, counting you, plus your accountant, who doesn't take a seat.`,
            "Each person logs in with their own account and their own password.",
          ],
          k: "users employees team",
        },
        {
          q: "How do I invite someone?",
          a: [`In Team, type their email and choose what they can do. We give you an invitation link to send them; it expires in ${f.inviteDays} days. They join with the same email you invited.`],
          k: "invite invitation link",
        },
        {
          q: "What can an employee do?",
          a: ["They make sales at the point of sale, see and add clients, see your services and upload receipt photos. They don't see the bank, the reports or the taxes."],
          k: "employee role permissions staff",
        },
        {
          q: "What can my accountant do?",
          a: ["They see your numbers to keep your books: sales, expenses, bank, reports, vendors and receipts. They can't change anything."],
          k: "accountant cpa role permissions",
        },
        {
          q: "Is there anything nobody on my team can see?",
          a: ["Yes. Nobody on your team sees your tax documents, your plan and payments, your team list, your personal finances or your chats with the assistant."],
          k: "privacy permissions",
        },
        {
          q: "How do I remove someone or change their role?",
          a: ["In Team, next to their name, pick another role or tap Remove. From that moment on, they can't see your data."],
          k: "remove delete role",
        },
        {
          q: "I'm on Pro: how do I send my numbers to my accountant?",
          a: ["Pro and Business include For your accountant: download the period's books as Excel or PDF and send them over."],
          k: "excel pdf export accountant",
        },
      ],
    },
    {
      id: "security",
      title: "Security and data",
      short: "Security",
      more: { label: "All about security", to: "/seguridad" },
      items: [
        {
          q: "Can you see my bank password?",
          a: ["No. You log in to your bank inside Plaid, and your username and password never reach us."],
          k: "plaid password",
        },
        {
          q: "Do you store my card details?",
          a: ["No. You pay on Stripe's secure page, and we don't store your card number."],
          k: "stripe card",
        },
        {
          q: "How do you store my documents and receipts?",
          a: ["Encrypted with AES‑256‑GCM. The key to open them lives only on the server, apart from the database. Only you and your tax preparer can open your tax documents."],
          k: "encryption encrypted aes",
        },
        {
          q: "How do you protect my account?",
          a: ["Your password is stored with bcrypt, a one-way method: not even we can read it. If someone tries to log in too many times in a row, we pause the attempts for 15 minutes. And everything travels over an encrypted connection (HTTPS)."],
          k: "password session https bcrypt",
        },
        {
          q: "Do you sell my information?",
          a: ["No. We don't sell or share your information with other companies for advertising. Our privacy policy explains it."],
          k: "privacy sell data",
        },
        {
          q: "Can I delete my account?",
          a: ["Yes. Ask us to delete it as our privacy policy explains. When it's deleted, your tax documents, receipts, vendors, quotes and bank transactions are deleted too."],
          k: "delete remove account data",
        },
      ],
    },
    {
      id: "personal",
      title: "Personal mode",
      short: "Personal mode",
      items: [
        {
          q: "What is Personal mode?",
          a: ["It's the part of the app for your household money: see where your money goes each month, your subscriptions, your savings goals and your taxes."],
          k: "personal finance household",
        },
        {
          q: "What does the free Basic plan include?",
          a: [`Your taxes (you upload your documents and your preparer does your federal and Alabama returns) and the AI assistant with ${f.questions.personalBasic} questions a month. It's free forever and doesn't ask for a card.`],
          k: "free basic",
        },
        {
          q: "What does the Pro plan add?",
          a: [
            `For ${usd(f.prices.personalPro.monthly)} a month or ${usd(f.prices.personalPro.annual)} a year, everything in Basic, plus:`,
            [
              "A secure connection to your bank.",
              "Transactions categorized automatically.",
              "Subscription and recurring charge finder.",
              "Savings goals.",
              "Monthly income and spending summary.",
              "Category budgets with alerts.",
              `Assistant with ${f.questions.personalPro} questions a month.`,
            ],
          ],
          k: "pro personal price",
        },
        {
          q: "How do budgets work?",
          a: ["You set a monthly limit for each category, like food or gas. On your Home screen we let you know when you reach 80% and when you go over."],
          k: "budget alert limit",
        },
        {
          q: "Does the subscription finder cancel them for me?",
          a: ["No, but it helps: it shows you the charges that repeat and how much they add up to each month, and gives you a step-by-step guide and a ready-to-send email to cancel them. When you cancel, you mark it and keep track of what you save."],
          k: "subscriptions netflix cancel recurring charges",
        },
        {
          q: "What happens if I stop paying for Pro?",
          a: ["You keep the free Basic plan: your taxes and the assistant."],
          k: "cancel pro downgrade",
        },
      ],
    },
  ],
  help: {
    title: "Didn't find your answer?",
    text: (days: number) => `The best way to clear up your doubts is to try it yourself: you get ${days} days with everything included, and we don't ask for a card.`,
    taxes: "Already have an account and your question is about your tax return? Message your preparer from Taxes.",
    register: "Create a free account",
    login: "Log in",
    moreLabel: "You may also find useful",
    links: [
      { label: "How it works", to: "/como-funciona" },
      { label: "Security", to: "/seguridad" },
      { label: "Pricing", to: "/precios" },
    ],
  },
};

export const preguntasCopy: Record<Lang, PreguntasCopy> = { es, en };
