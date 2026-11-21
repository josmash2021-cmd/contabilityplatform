// Copy for the 2.0 Settings page (src/pages/Settings.tsx) and the 2.0 onboarding form
// (src/pages/Onboarding.tsx). The older field labels, Clover and subscription texts
// stay in billing.ts and auth.ts; this file only adds what the new screens need.
import type { Lang } from "../lang";

const es = {
  business: {
    title: "Ajustes",
    subtitle: "Tu negocio, tu plan y tu cuenta.",
    companyTitle: "Tu negocio",
    companyText: "Tu nombre, dirección y teléfono salen en los recibos que das al cobrar.",
    contact: "Contacto",
    where: "Dónde estás",
    payTitle: "Cobros por Zelle",
    zelleHint: "Se lo mostramos a tu cliente en Cobrar cuando te paga por Zelle.",
    unsaved: "Tienes cambios sin guardar.",
    upToDate: "Todo guardado.",
    save: "Guardar cambios",
    preview: "Así sale en tus recibos",
    previewEmpty: "Escribe el nombre de tu negocio",
    previewNote: "Así se ve el encabezado del recibo que das al cobrar.",
    cloverTitle: "Terminal Clover",
    cloverText: "Para cobrar con tarjeta desde Cobrar.",
    cloverOpen: "Configurar",
    cloverClose: "Cerrar",
    merchantId: "Merchant ID",
    apiToken: "API Token",
    requiredMark: "(obligatorio)",
  },
  personal: {
    title: "Perfil",
    subtitle: "Tu cuenta, tu plan e idioma.",
  },
  plan: {
    title: "Tu plan",
    text: "Pagas con tarjeta de forma segura con Stripe. Aquí cambias de plan o manejas tu tarjeta.",
  },
  account: {
    title: "Tu cuenta",
    name: "Nombre",
    email: "Correo",
    language: "Idioma",
    languageText: "Cambia al momento en toda la app.",
    logout: "Cerrar sesión",
  },
  loadError: "No pudimos cargar tus ajustes.",
  retry: "Intentar de nuevo",
  onboarding: {
    companyHint: "Así sale en tus recibos.",
    required: "Todos los datos son necesarios.",
  },
};

export type SettingsCopy = typeof es;

const en: SettingsCopy = {
  business: {
    title: "Settings",
    subtitle: "Your business, your plan and your account.",
    companyTitle: "Your business",
    companyText: "Your name, address and phone show on the receipts you give when you take a payment.",
    contact: "Contact",
    where: "Where you are",
    payTitle: "Zelle payments",
    zelleHint: "We show it to your client in Checkout when they pay you by Zelle.",
    unsaved: "You have unsaved changes.",
    upToDate: "All saved.",
    save: "Save changes",
    preview: "How it shows on your receipts",
    previewEmpty: "Type your business name",
    previewNote: "This is the top of the receipt you give when you take a payment.",
    cloverTitle: "Clover terminal",
    cloverText: "To take card payments from Checkout.",
    cloverOpen: "Set up",
    cloverClose: "Close",
    merchantId: "Merchant ID",
    apiToken: "API Token",
    requiredMark: "(required)",
  },
  personal: {
    title: "Profile",
    subtitle: "Your account, your plan and language.",
  },
  plan: {
    title: "Your plan",
    text: "You pay by card, securely through Stripe. Change your plan or manage your card here.",
  },
  account: {
    title: "Your account",
    name: "Name",
    email: "Email",
    language: "Language",
    languageText: "Changes right away across the app.",
    logout: "Log out",
  },
  loadError: "We couldn't load your settings.",
  retry: "Try again",
  onboarding: {
    companyHint: "This is how it shows on your receipts.",
    required: "Every field is required.",
  },
};

export const settingsCopy: Record<Lang, SettingsCopy> = { es, en };
