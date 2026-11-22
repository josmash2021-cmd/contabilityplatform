// Copy for the /seguridad page (src/pages/site/Seguridad.tsx, src/components/marketing/site/Seguridad*).
// Every claim here is backed by the code; the file that proves each one is noted beside it.
// Don't add certifications, 2FA, backups or anything else the product doesn't do today.
import type { Lang } from "../../lang";

/** How much access a role has to one part of the app (icon in the table; the label says it in words). */
export type SeguridadLevel = "yes" | "read" | "no";
type Cell = [SeguridadLevel, string];

const es = {
  pageTitle: "Seguridad",
  hero: {
    eyebrow: "Seguridad",
    titleA: "Tus datos, protegidos.",
    titleB: "Tu dinero, siempre tuyo.",
    text: "Tu banco se conecta con Plaid, tu plan se paga con Stripe y tus documentos se guardan cifrados. Aquí te contamos, sin letra chiquita, cómo cuidamos tu información y quién puede ver qué.",
    secondary: "Política de privacidad",
    visual: {
      label: "Resumen de cómo protegemos tu información",
      title: "Así cuidamos lo tuyo",
      subtitle: "En cada parte de la app",
      rows: [
        { title: "Tu banco", value: "Solo lectura, con Plaid" }, // api/bank-router.ts createLinkToken: products ["transactions"]
        { title: "Tu tarjeta", value: "La recibe Stripe, no nosotros" }, // api/subscription-router.ts createCheckoutSession
        { title: "Tus documentos", value: "Cifrados con AES‑256" }, // api/lib/taxCrypto.ts
        { title: "Tu contraseña", value: "Guardada con bcrypt" }, // api/auth-router.ts bcrypt.hash
        { title: "Tu equipo", value: "Cada quien con su permiso" }, // api/lib/team.ts memberCan
      ],
      footer: "Conexión cifrada (HTTPS) en todo el sitio",
    },
  },
  trust: {
    label: "Con quién trabajamos",
    items: [
      { title: "Tu banco, con Plaid", text: "Entras a tu banco dentro de Plaid, no en nuestra página." },
      { title: "Tus pagos, con Stripe", text: "Tu tarjeta la recibe Stripe, nunca nuestros servidores." },
      { title: "Conexión cifrada (HTTPS)", text: "Todo lo que envías y recibes viaja protegido." },
      { title: "Documentos cifrados", text: "Impuestos y recibos guardados con AES‑256." },
    ],
  },
  pillars: {
    eyebrow: "Cómo te protegemos",
    title: "Seis maneras de cuidar tu información",
    text: "Cada una con su explicación sencilla, para que sepas exactamente qué pasa con tus datos.",
    how: "Cómo funciona",
    items: [
      {
        title: "Tu banco, con Plaid y solo para leer",
        text: "Conectas tu banco a través de Plaid, una empresa que se dedica a conectar bancos con apps de forma segura.",
        points: [
          "Inicias sesión en tu banco dentro de la ventana de Plaid. Nunca vemos ni guardamos tu usuario ni tu contraseña del banco.",
          "La conexión solo trae tus movimientos y saldos. Desde aquí nadie puede hacer pagos ni transferencias.",
          "La llave de acceso que nos da Plaid se queda en nuestro servidor; nunca llega a tu navegador.",
          "Desconectas tu banco cuando quieras.",
        ],
      },
      {
        title: "Pagos con Stripe",
        text: "Pagas tu plan en la página segura de Stripe. Tu tarjeta no pasa por nosotros.",
        points: [
          "Escribes los datos de tu tarjeta en la página de Stripe, no en la nuestra.",
          "No guardamos el número de tu tarjeta. Para cambiarla, Ajustes te lleva al portal de Stripe.",
          "Solo aceptamos avisos de pago firmados por Stripe, así nadie puede fingir un pago.",
          "Para la prueba gratis no pedimos tarjeta: no hay cobros sorpresa.",
        ],
      },
      {
        title: "Documentos de impuestos y recibos, cifrados",
        text: "Tus papeles más delicados, como tu ID, tu Seguro Social, tus W‑2 o las fotos de tus recibos, se guardan bajo llave.",
        points: [
          "Cada archivo se guarda cifrado con AES‑256‑GCM, un estándar de cifrado muy fuerte.",
          "La llave para abrirlos vive solo en el servidor, separada de la base de datos. Una copia de la base de datos, sola, no sirve para abrirlos.",
          "Antes de guardar un archivo, revisamos que de verdad sea una foto o un PDF.",
          "Tus documentos de impuestos solo los abren tú y tu preparador.",
        ],
      },
      {
        title: "Contraseñas y sesiones",
        text: "Tu contraseña no se guarda tal cual: ni nosotros podemos leerla.",
        points: [
          "La guardamos convertida con bcrypt, un método de un solo sentido: sirve para comprobarla, pero no para descifrarla.",
          "Si alguien intenta entrar a tu cuenta muchas veces (10 intentos en 15 minutos), pausamos los intentos.",
          "Tu sesión va firmada por nuestro servidor, vence sola a los 30 días y se borra de tu navegador cuando cierras sesión.",
          "Todo viaja por una conexión cifrada (HTTPS).",
        ],
      },
      {
        title: "Tu equipo, con permisos",
        text: "En los planes Pro y Negocio cada persona entra con su propia cuenta y solo ve lo que su rol le permite.",
        points: [
          "Empleado: cobra, atiende a tus clientes y sube recibos.",
          "Contador: ve tus números y reportes, pero no puede cambiar nada.",
          "Nadie de tu equipo ve tus impuestos, tu plan, tus pagos, tus finanzas personales ni tu chat con el asistente.",
          "Los permisos los revisa nuestro servidor en cada paso, no solo la pantalla.",
        ],
      },
      {
        title: "Tus datos son tuyos",
        text: "Tú decides qué se conecta, quién entra y cuándo te vas.",
        points: [
          "Al desconectar tu banco, borramos de la app esa conexión y los movimientos que trajo.",
          "Cuando quitas a alguien de tu equipo, pierde el acceso desde ese momento.",
          "Si pides borrar tu cuenta, se borran con ella tus documentos de impuestos, tus recibos, tus proveedores, tus cotizaciones y tus movimientos del banco.",
        ],
      },
    ],
  },
  access: {
    eyebrow: "Permisos",
    title: "Qué puede ver cada quien",
    text: "Con los planes Pro y Negocio puedes invitar a tus empleados y a tu contador. Así queda repartido el acceso:",
    caption: "Qué puede ver y hacer el dueño, un empleado y el contador en cada parte de la app",
    colArea: "Parte de la app",
    roles: [
      { name: "Dueño", note: "Tú" },
      { name: "Empleado", note: "Hasta 9" },
      { name: "Contador", note: "1, no ocupa lugar" },
    ],
    rows: [
      { area: "Ventas y punto de venta", cells: [["yes", "Todo"], ["yes", "Ve y cobra"], ["read", "Solo ve"]] as Cell[] },
      { area: "Clientes", cells: [["yes", "Todo"], ["yes", "Ve, agrega y edita"], ["read", "Solo ve"]] as Cell[] },
      { area: "Recibos", cells: [["yes", "Todo"], ["yes", "Ve y sube"], ["read", "Solo ve"]] as Cell[] },
      { area: "Banco, gastos y reportes", cells: [["yes", "Todo"], ["no", "No"], ["read", "Solo ve"]] as Cell[] },
      { area: "Proveedores y cotizaciones", cells: [["yes", "Todo"], ["no", "No"], ["read", "Solo ve"]] as Cell[] },
      { area: "Documentos de impuestos", cells: [["yes", "Tú y tu preparador"], ["no", "No"], ["no", "No"]] as Cell[] },
      { area: "Plan, pagos y equipo", cells: [["yes", "Todo"], ["no", "No"], ["no", "No"]] as Cell[] },
      { area: "Tus finanzas personales", cells: [["yes", "Todo"], ["no", "No"], ["no", "No"]] as Cell[] },
      { area: "Asistente de IA", cells: [["yes", "Todo"], ["no", "No"], ["no", "No"]] as Cell[] },
    ],
    legendLabel: "Qué significa cada símbolo",
    legend: { yes: "Puede usarlo", read: "Solo puede ver, no cambia nada", no: "No tiene acceso" } as Record<SeguridadLevel, string>,
    footnote: "Equipo está en Pro (hasta 5 usuarios) y en Negocio (hasta 20), contándote a ti, más tu contador. Estos permisos los aplica nuestro servidor en cada solicitud: si alguien no tiene acceso a algo, no lo recibe aunque intente abrirlo.",
  },
  never: {
    eyebrow: "Nuestro compromiso",
    title: "Lo que nunca hacemos",
    text: "Para que estés tranquilo, esto es lo que no hacemos con tu información.",
    /** Read before each item by screen readers. */
    srPrefix: "Nunca:",
    items: [
      { title: "Ver la contraseña de tu banco", text: "Entras a tu banco dentro de Plaid. Tu usuario y tu contraseña nunca llegan a nosotros." },
      { title: "Mover tu dinero", text: "La conexión con tu banco es de solo lectura: no puede hacer pagos ni transferencias." },
      { title: "Guardar tu tarjeta", text: "Pagas en la página de Stripe. No guardamos el número de tu tarjeta." },
      { title: "Cobrarte al terminar la prueba", text: "No te pedimos tarjeta para empezar, así que no hay cobros automáticos. Tú decides si pagas." },
      { title: "Vender tu información", text: "No vendemos ni compartimos tus datos con otras empresas para publicidad. Así lo dice nuestra política de privacidad." },
      { title: "Dejar que la IA cambie tus cosas", text: "El asistente solo lee tus propios datos para contestarte. No puede cambiar, borrar ni enviar nada." },
    ],
  },
  control: {
    eyebrow: "Tú tienes el control",
    title: "Si algo no se ve bien",
    text: "Si notas algo raro o simplemente cambiaste de opinión, esto lo puedes hacer tú, en cualquier momento.",
    whereLabel: "Dónde",
    items: [
      {
        title: "Desconecta tu banco",
        text: "Cortas la conexión y borramos de la app los movimientos que trajo. Si crees que alguien sabe la contraseña de tu banco, cámbiala en tu banco: nosotros nunca la tuvimos.",
        where: ["Negocio: en el menú, entra a Banco, toca Desconectar y confirma.", "Personal: en Inicio, toca Desconectar banco."],
      },
      {
        title: "Quita a alguien de tu equipo",
        text: "Desde ese momento ya no puede ver tus datos. Si solo quieres darle menos acceso, cámbiale el rol.",
        where: ["En el menú, entra a Equipo y toca Quitar junto a su nombre."],
      },
      {
        title: "Cierra tu sesión",
        text: "Si usaste una computadora prestada, cierra tu sesión al terminar. Se borra de ese navegador.",
        where: ["En el menú, toca Cerrar sesión."],
      },
      {
        title: "Pide borrar tu cuenta",
        text: "Se borra tu cuenta y, con ella, tus documentos de impuestos, tus recibos, tus proveedores, tus cotizaciones y tus movimientos del banco.",
        where: ["Sigue los pasos de nuestra política de privacidad."],
        link: "Ir a la política de privacidad",
      },
    ],
    privacy: {
      title: "¿Quieres todos los detalles?",
      text: "En nuestra política de privacidad explicamos qué datos guardamos, para qué los usamos y cómo pedir que los borremos.",
      cta: "Leer la política de privacidad",
    },
  },
};

export type SeguridadCopy = typeof es;

const en: SeguridadCopy = {
  pageTitle: "Security",
  hero: {
    eyebrow: "Security",
    titleA: "Your data, protected.",
    titleB: "Your money, always yours.",
    text: "Your bank connects through Plaid, your plan is paid through Stripe, and your documents are stored encrypted. Here's how we look after your information and who can see what, with no fine print.",
    secondary: "Privacy policy",
    visual: {
      label: "Summary of how we protect your information",
      title: "How we look after your things",
      subtitle: "In every part of the app",
      rows: [
        { title: "Your bank", value: "Read-only, through Plaid" },
        { title: "Your card", value: "Stripe takes it, not us" },
        { title: "Your documents", value: "Encrypted with AES‑256" },
        { title: "Your password", value: "Stored with bcrypt" },
        { title: "Your team", value: "Each person with their own access" },
      ],
      footer: "Encrypted connection (HTTPS) across the whole site",
    },
  },
  trust: {
    label: "Who we work with",
    items: [
      { title: "Your bank, through Plaid", text: "You log in to your bank inside Plaid, not on our page." },
      { title: "Your payments, through Stripe", text: "Stripe takes your card, never our servers." },
      { title: "Encrypted connection (HTTPS)", text: "Everything you send and receive is protected in transit." },
      { title: "Encrypted documents", text: "Tax documents and receipts stored with AES‑256." },
    ],
  },
  pillars: {
    eyebrow: "How we protect you",
    title: "Six ways we look after your information",
    text: "Each one explained in plain words, so you know exactly what happens with your data.",
    how: "How it works",
    items: [
      {
        title: "Your bank, through Plaid and read-only",
        text: "You connect your bank through Plaid, a company that specializes in connecting banks to apps securely.",
        points: [
          "You log in to your bank inside the Plaid window. We never see or store your bank username or password.",
          "The connection only brings in your transactions and balances. Nobody can make payments or transfers from here.",
          "The access key Plaid gives us stays on our server; it never reaches your browser.",
          "Disconnect your bank whenever you want.",
        ],
      },
      {
        title: "Payments through Stripe",
        text: "You pay for your plan on Stripe's secure page. Your card doesn't go through us.",
        points: [
          "You type your card details on Stripe's page, not ours.",
          "We don't store your card number. To change it, Settings takes you to Stripe's portal.",
          "We only accept payment notices signed by Stripe, so nobody can fake a payment.",
          "The free trial doesn't need a card: no surprise charges.",
        ],
      },
      {
        title: "Tax documents and receipts, encrypted",
        text: "Your most sensitive papers, like your ID, your Social Security card, your W‑2s or your receipt photos, are kept under lock and key.",
        points: [
          "Every file is stored encrypted with AES‑256‑GCM, a very strong encryption standard.",
          "The key to open them lives only on the server, apart from the database. A copy of the database on its own can't open them.",
          "Before we store a file, we check that it really is a photo or a PDF.",
          "Only you and your tax preparer can open your tax documents.",
        ],
      },
      {
        title: "Passwords and sessions",
        text: "Your password isn't stored as you typed it: not even we can read it.",
        points: [
          "We store it transformed with bcrypt, a one-way method: it can be checked, but not decrypted.",
          "If someone tries to log in to your account too many times (10 tries in 15 minutes), we pause the attempts.",
          "Your session is signed by our server, expires on its own after 30 days and is removed from your browser when you log out.",
          "Everything travels over an encrypted connection (HTTPS).",
        ],
      },
      {
        title: "Your team, with permissions",
        text: "On the Pro and Business plans, each person logs in with their own account and only sees what their role allows.",
        points: [
          "Employee: makes sales, looks after your clients and uploads receipts.",
          "Accountant: sees your numbers and reports, but can't change anything.",
          "Nobody on your team sees your taxes, your plan, your payments, your personal finances or your chats with the assistant.",
          "Our server checks permissions at every step, not just the screen.",
        ],
      },
      {
        title: "Your data is yours",
        text: "You decide what's connected, who gets in and when you leave.",
        points: [
          "When you disconnect your bank, we remove that connection and the transactions it brought in from the app.",
          "When you remove someone from your team, they lose access right away.",
          "If you ask us to delete your account, your tax documents, receipts, vendors, quotes and bank transactions are deleted with it.",
        ],
      },
    ],
  },
  access: {
    eyebrow: "Permissions",
    title: "Who can see what",
    text: "With the Pro and Business plans you can invite your employees and your accountant. This is how access is split:",
    caption: "What the owner, an employee and the accountant can see and do in each part of the app",
    colArea: "Part of the app",
    roles: [
      { name: "Owner", note: "You" },
      { name: "Employee", note: "Up to 9" },
      { name: "Accountant", note: "1, doesn't take a seat" },
    ],
    rows: [
      { area: "Sales and point of sale", cells: [["yes", "Everything"], ["yes", "Sees and sells"], ["read", "View only"]] },
      { area: "Clients", cells: [["yes", "Everything"], ["yes", "Sees, adds and edits"], ["read", "View only"]] },
      { area: "Receipts", cells: [["yes", "Everything"], ["yes", "Sees and uploads"], ["read", "View only"]] },
      { area: "Bank, expenses and reports", cells: [["yes", "Everything"], ["no", "No"], ["read", "View only"]] },
      { area: "Vendors and quotes", cells: [["yes", "Everything"], ["no", "No"], ["read", "View only"]] },
      { area: "Tax documents", cells: [["yes", "You and your preparer"], ["no", "No"], ["no", "No"]] },
      { area: "Plan, payments and team", cells: [["yes", "Everything"], ["no", "No"], ["no", "No"]] },
      { area: "Your personal finances", cells: [["yes", "Everything"], ["no", "No"], ["no", "No"]] },
      { area: "AI assistant", cells: [["yes", "Everything"], ["no", "No"], ["no", "No"]] },
    ],
    legendLabel: "What each symbol means",
    legend: { yes: "Can use it", read: "Can only look, changes nothing", no: "No access" },
    footnote: "Team is part of Pro (up to 5 users) and Business (up to 20), counting you, plus your accountant. Our server applies these permissions on every request: if someone doesn't have access to something, they don't get it, even if they try to open it.",
  },
  never: {
    eyebrow: "Our commitment",
    title: "What we never do",
    text: "So you can rest easy, this is what we don't do with your information.",
    srPrefix: "Never:",
    items: [
      { title: "See your bank password", text: "You log in to your bank inside Plaid. Your username and password never reach us." },
      { title: "Move your money", text: "The connection to your bank is read-only: it can't make payments or transfers." },
      { title: "Store your card", text: "You pay on Stripe's page. We don't store your card number." },
      { title: "Charge you when the trial ends", text: "We don't ask for a card to start, so there are no automatic charges. You decide whether to pay." },
      { title: "Sell your information", text: "We don't sell or share your data with other companies for advertising. Our privacy policy says so." },
      { title: "Let the AI change your things", text: "The assistant only reads your own data to answer you. It can't change, delete or send anything." },
    ],
  },
  control: {
    eyebrow: "You're in control",
    title: "If something doesn't look right",
    text: "If you notice something odd, or you simply changed your mind, you can do this yourself at any time.",
    whereLabel: "Where",
    items: [
      {
        title: "Disconnect your bank",
        text: "You cut the connection and we remove the transactions it brought in from the app. If you think someone knows your bank password, change it at your bank: we never had it.",
        where: ["Business: in the menu, go to Bank, tap Disconnect and confirm.", "Personal: on Home, tap Disconnect bank."],
      },
      {
        title: "Remove someone from your team",
        text: "From that moment on, they can't see your data. If you just want to give them less access, change their role.",
        where: ["In the menu, go to Team and tap Remove next to their name."],
      },
      {
        title: "Log out",
        text: "If you used a borrowed computer, log out when you're done. Your session is removed from that browser.",
        where: ["In the menu, tap Log out."],
      },
      {
        title: "Ask us to delete your account",
        text: "Your account is deleted and, with it, your tax documents, receipts, vendors, quotes and bank transactions.",
        where: ["Follow the steps in our privacy policy."],
        link: "Go to the privacy policy",
      },
    ],
    privacy: {
      title: "Want all the details?",
      text: "Our privacy policy explains what data we keep, what we use it for and how to ask us to delete it.",
      cta: "Read the privacy policy",
    },
  },
};

export const seguridadCopy: Record<Lang, SeguridadCopy> = { es, en };
