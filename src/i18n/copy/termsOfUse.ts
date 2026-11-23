// "Términos de uso" (/terminos-de-uso): the terms of the app itself, accepted when creating an account. The tax
// service has its own (/terminos). A draft written for the owner to have reviewed by a lawyer.
type Section = { h: string; p?: string; list?: string[] };

// The version saved with each acceptance is TERMS_VERSION (contracts/constants.ts): change it with the text.

const es = {
  title: "Términos de uso",
  updated: "Última actualización: 23 de noviembre de 2026",
  intro: "Estos términos explican cómo funciona Personal & Business Solutions, la app de contabilidad para tu negocio y tus finanzas personales. Al crear tu cuenta y marcar la casilla, los aceptas. El servicio de impuestos tiene sus propios términos.",
  sections: [
    { h: "El servicio", p: "La app te ayuda a llevar tus ventas, facturas, gastos, bancos, presupuestos y metas, y a ver reportes. Tiene un asistente con inteligencia artificial. La preparación de impuestos es un servicio aparte, con sus Términos del servicio de impuestos." },
    { h: "Tu cuenta", list: [
      "Tienes que ser mayor de 18 años y dar datos verdaderos.",
      "Cuida tu contraseña. Lo que se haga con tu cuenta es tu responsabilidad.",
      "Si invitas a tu equipo, tú decides qué puede ver y hacer cada persona.",
    ] },
    { h: "Prueba gratis y planes", list: [
      "Empiezas con 7 días gratis con acceso completo, sin tarjeta.",
      "Después eliges un plan. Los precios están en la página de Precios. El plan Básico personal es gratis.",
      "Cuando termina la prueba, la app te pide elegir un plan para seguir. Tus datos no se borran.",
    ] },
    { h: "Pagos y cancelación", list: [
      "Los planes se pagan por mes o por año, por adelantado, y se renuevan solos.",
      "Los pagos los procesa Stripe. Nosotros no guardamos los datos de tu tarjeta.",
      "Puedes cancelar cuando quieras. Tu plan sigue activo hasta que termine el periodo que ya pagaste.",
      "No devolvemos pagos de periodos ya empezados, salvo que la ley diga otra cosa.",
    ] },
    { h: "La conexión con tu banco", p: "Si conectas tu banco, lo haces con Plaid, con tu permiso. La app solo lee tus cuentas, saldos y movimientos; no puede mover tu dinero. Puedes desconectarlo cuando quieras." },
    { h: "El asistente con inteligencia artificial", p: "El asistente te ayuda a entender tus números, pero puede equivocarse. No es asesoría contable, legal ni de impuestos. Revisa lo importante antes de decidir." },
    { h: "Tus datos", list: [
      "Tus datos son tuyos. Los usamos para darte el servicio, como explica la Política de privacidad.",
      "Puedes descargar tus reportes en Excel y PDF cuando quieras.",
      "Si pides que borremos tu cuenta, la borramos con tus datos en un máximo de 30 días.",
    ] },
    { h: "Uso correcto", list: [
      "No uses la app para actividades ilegales ni para engañar a nadie.",
      "No intentes entrar a cuentas que no son tuyas ni dañar el servicio.",
      "Si no cumples estos términos, podemos suspender tu cuenta.",
    ] },
    { h: "Cambios y disponibilidad", p: "Mejoramos la app seguido y a veces cambiamos funciones. Hacemos lo posible para que funcione siempre, pero puede haber pausas. Si cambiamos estos términos de forma importante, te avisamos antes." },
    { h: "Responsabilidad", p: "La app es una herramienta: las decisiones de tu negocio y tus finanzas son tuyas. En la medida que permite la ley, nuestra responsabilidad se limita a lo que pagaste por el servicio en los últimos 12 meses." },
    { h: "Ley aplicable", p: "Estos términos se rigen por las leyes del estado de Alabama y de los Estados Unidos." },
  ] as Section[],
  contactTitle: "¿Preguntas?",
  contact: "Escríbenos a",
  orChat: "o usa el chat de ayuda del sitio.",
  privacyLink: "Ver la Política de privacidad",
  taxLink: "Ver los Términos del servicio de impuestos",
  back: "Volver",
};

const en: typeof es = {
  title: "Terms of Use",
  updated: "Last updated: November 23, 2026",
  intro: "These terms explain how Personal & Business Solutions works, the accounting app for your business and your personal finances. By creating your account and checking the box, you accept them. The tax service has its own terms.",
  sections: [
    { h: "The service", p: "The app helps you keep your sales, invoices, expenses, banks, budgets and goals, and see reports. It has an AI assistant. Tax preparation is a separate service, with its own Tax Service Terms." },
    { h: "Your account", list: [
      "You must be 18 or older and give true information.",
      "Keep your password safe. What's done with your account is your responsibility.",
      "If you invite your team, you decide what each person can see and do.",
    ] },
    { h: "Free trial and plans", list: [
      "You start with 7 free days with full access, no card.",
      "Then you pick a plan. Prices are on the Pricing page. The personal Basic plan is free.",
      "When the trial ends, the app asks you to pick a plan to keep going. Your data isn't deleted.",
    ] },
    { h: "Payments and cancellation", list: [
      "Plans are paid monthly or yearly, in advance, and renew on their own.",
      "Payments are processed by Stripe. We don't keep your card details.",
      "You can cancel anytime. Your plan stays active until the period you already paid ends.",
      "We don't refund periods already started, unless the law says otherwise.",
    ] },
    { h: "Your bank connection", p: "If you connect your bank, you do it through Plaid, with your permission. The app only reads your accounts, balances and transactions; it can't move your money. You can disconnect it anytime." },
    { h: "The AI assistant", p: "The assistant helps you understand your numbers, but it can make mistakes. It isn't accounting, legal or tax advice. Check what matters before you decide." },
    { h: "Your data", list: [
      "Your data is yours. We use it to give you the service, as the Privacy Policy explains.",
      "You can download your reports in Excel and PDF anytime.",
      "If you ask us to delete your account, we delete it with your data within 30 days.",
    ] },
    { h: "Proper use", list: [
      "Don't use the app for illegal activities or to deceive anyone.",
      "Don't try to get into accounts that aren't yours or harm the service.",
      "If you don't follow these terms, we can suspend your account.",
    ] },
    { h: "Changes and availability", p: "We improve the app often and sometimes change features. We do our best to keep it working, but there can be pauses. If we change these terms in an important way, we'll let you know first." },
    { h: "Liability", p: "The app is a tool: the decisions about your business and finances are yours. As far as the law allows, our liability is limited to what you paid for the service in the last 12 months." },
    { h: "Governing law", p: "These terms are governed by the laws of the State of Alabama and the United States." },
  ],
  contactTitle: "Questions?",
  contact: "Write to us at",
  orChat: "or use the site's help chat.",
  privacyLink: "See the Privacy Policy",
  taxLink: "See the Tax Service Terms",
  back: "Back",
};

export const termsOfUseCopy = { es, en };
