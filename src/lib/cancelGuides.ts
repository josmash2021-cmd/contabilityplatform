/** Cancellation guides for popular subscription services */
import type { Lang } from "@/i18n/lang";

export interface CancelGuide {
  steps: string[];
  link: string;
  linkLabel: string;
  estimatedTime: string;
}

/** linkLabel is a plain string when it's a URL (same in every language). */
interface GuideDef {
  steps: Record<Lang, string[]>;
  link: string;
  linkLabel: string | Record<Lang, string>;
  /** Minutes, e.g. "2" or "10-15". */
  minutes: string;
}

const minutesLabel = (minutes: string, lang: Lang) => `${minutes} ${lang === "es" ? "minutos" : "minutes"}`;

// Order matters: the first key contained in the merchant name wins.
const GUIDES: Record<string, GuideDef> = {
  netflix: {
    steps: {
      es: [
        "Inicia sesión en netflix.com",
        "Ve a Cuenta (ícono de perfil arriba a la derecha)",
        "Selecciona 'Cuenta' o 'Account'",
        "Haz click en 'Cancelar membresía'",
        "Confirma la cancelación",
      ],
      en: [
        "Sign in at netflix.com",
        "Go to Account (profile icon in the top right)",
        "Select 'Account'",
        "Click 'Cancel Membership'",
        "Confirm the cancellation",
      ],
    },
    link: "https://www.netflix.com/cancelplan",
    linkLabel: "netflix.com/cancelplan",
    minutes: "2",
  },
  spotify: {
    steps: {
      es: [
        "Ve a spotify.com/account",
        "Inicia sesión con tu cuenta",
        "En el menú, selecciona 'Gestionar tu plan'",
        "Haz click en 'Cambiar o cancelar'",
        "Selecciona 'Cancelar Premium'",
        "Confirma la cancelación",
      ],
      en: [
        "Go to spotify.com/account",
        "Sign in to your account",
        "In the menu, select 'Manage your plan'",
        "Click 'Change plan'",
        "Select 'Cancel Premium'",
        "Confirm the cancellation",
      ],
    },
    link: "https://www.spotify.com/account/change-plan/",
    linkLabel: "spotify.com/account",
    minutes: "3",
  },
  disney: {
    steps: {
      es: [
        "Ve a disneyplus.com e inicia sesión",
        "Haz click en tu perfil (arriba a la derecha)",
        "Selecciona 'Cuenta'",
        "Ve a 'Suscripción' > 'Cancelar suscripción'",
        "Sigue los pasos para confirmar",
      ],
      en: [
        "Go to disneyplus.com and sign in",
        "Click your profile (top right)",
        "Select 'Account'",
        "Go to 'Subscription' > 'Cancel Subscription'",
        "Follow the steps to confirm",
      ],
    },
    link: "https://www.disneyplus.com/account",
    linkLabel: "disneyplus.com/account",
    minutes: "2",
  },
  hulu: {
    steps: {
      es: [
        "Ve a hulu.com/account e inicia sesión",
        "Ve a 'Tu Cuenta'",
        "Selecciona 'Cancelar' junto a tu suscripción",
        "Sigue los pasos para confirmar",
      ],
      en: [
        "Go to hulu.com/account and sign in",
        "Go to 'Your Account'",
        "Select 'Cancel' next to your subscription",
        "Follow the steps to confirm",
      ],
    },
    link: "https://www.hulu.com/account",
    linkLabel: "hulu.com/account",
    minutes: "2",
  },
  hbo: {
    steps: {
      es: [
        "Ve a max.com e inicia sesión",
        "Haz click en tu perfil",
        "Selecciona 'Configuración' > 'Suscripción'",
        "Haz click en 'Gestionar suscripción' > 'Cancelar'",
      ],
      en: [
        "Go to max.com and sign in",
        "Click your profile",
        "Select 'Settings' > 'Subscription'",
        "Click 'Manage Subscription' > 'Cancel'",
      ],
    },
    link: "https://max.com/account",
    linkLabel: "max.com/account",
    minutes: "2",
  },
  youtube: {
    steps: {
      es: [
        "Ve a youtube.com/paid_memberships",
        "Inicia sesión con tu cuenta de Google",
        "Encuentra tu membresía y haz click en 'Gestionar'",
        "Selecciona 'Cancelar membresía'",
      ],
      en: [
        "Go to youtube.com/paid_memberships",
        "Sign in with your Google account",
        "Find your membership and click 'Manage'",
        "Select 'Cancel membership'",
      ],
    },
    link: "https://www.youtube.com/paid_memberships",
    linkLabel: "youtube.com/paid_memberships",
    minutes: "2",
  },
  "apple music": {
    steps: {
      es: [
        "En tu iPhone: Abre Configuración > [Tu nombre] > Suscripciones",
        "Selecciona Apple Music",
        "Haz click en 'Cancelar suscripción'",
        "O en la web: music.apple.com/account",
      ],
      en: [
        "On your iPhone: Open Settings > [Your Name] > Subscriptions",
        "Select Apple Music",
        "Tap 'Cancel Subscription'",
        "Or on the web: music.apple.com/account",
      ],
    },
    link: "https://music.apple.com/account",
    linkLabel: "music.apple.com/account",
    minutes: "2",
  },
  "apple tv": {
    steps: {
      es: [
        "Ve a tv.apple.com e inicia sesión",
        "Ve a Configuración de cuenta",
        "Selecciona 'Suscripciones' > 'Cancelar'",
      ],
      en: [
        "Go to tv.apple.com and sign in",
        "Go to Account Settings",
        "Select 'Subscriptions' > 'Cancel'",
      ],
    },
    link: "https://tv.apple.com/settings",
    linkLabel: "tv.apple.com/settings",
    minutes: "2",
  },
  paramount: {
    steps: {
      es: [
        "Ve a paramountplus.com/account",
        "Inicia sesión",
        "Ve a 'Suscripción' y selecciona 'Cancelar'",
      ],
      en: [
        "Go to paramountplus.com/account",
        "Sign in",
        "Go to 'Subscription' and select 'Cancel'",
      ],
    },
    link: "https://www.paramountplus.com/account/",
    linkLabel: "paramountplus.com/account",
    minutes: "2",
  },
  crunchyroll: {
    steps: {
      es: [
        "Ve a crunchyroll.com/noble/settings",
        "Inicia sesión",
        "Ve a 'Configuración de cuenta' > 'Premium'",
        "Haz click en 'Cancelar membresía'",
      ],
      en: [
        "Go to crunchyroll.com/noble/settings",
        "Sign in",
        "Go to 'Account Settings' > 'Premium'",
        "Click 'Cancel Membership'",
      ],
    },
    link: "https://www.crunchyroll.com/noble/settings",
    linkLabel: "crunchyroll.com/settings",
    minutes: "2",
  },
  amazon: {
    steps: {
      es: [
        "Ve a amazon.com/appstoresubscriptions",
        "Inicia sesión",
        "Busca tu suscripción (Prime, Music, etc.)",
        "Haz click en 'Gestionar' > 'Cancelar'",
      ],
      en: [
        "Go to amazon.com/appstoresubscriptions",
        "Sign in",
        "Find your subscription (Prime, Music, etc.)",
        "Click 'Manage' > 'Cancel'",
      ],
    },
    link: "https://www.amazon.com/appstoresubscriptions",
    linkLabel: "amazon.com/appstoresubscriptions",
    minutes: "3",
  },
  adobe: {
    steps: {
      es: [
        "Ve a account.adobe.com/plans",
        "Inicia sesión",
        "Selecciona el plan que quieres cancelar",
        "Haz click en 'Gestionar plan' > 'Cancelar plan'",
      ],
      en: [
        "Go to account.adobe.com/plans",
        "Sign in",
        "Select the plan you want to cancel",
        "Click 'Manage plan' > 'Cancel plan'",
      ],
    },
    link: "https://account.adobe.com/plans",
    linkLabel: "account.adobe.com/plans",
    minutes: "3",
  },
  microsoft: {
    steps: {
      es: [
        "Ve a account.microsoft.com/services",
        "Inicia sesión",
        "Encuentra Microsoft 365",
        "Haz click en 'Gestionar' > 'Cancelar suscripción'",
      ],
      en: [
        "Go to account.microsoft.com/services",
        "Sign in",
        "Find Microsoft 365",
        "Click 'Manage' > 'Cancel subscription'",
      ],
    },
    link: "https://account.microsoft.com/services/",
    linkLabel: "account.microsoft.com/services",
    minutes: "3",
  },
  gym: {
    steps: {
      es: [
        "Visita el gimnasio en persona O llama al número de teléfono",
        "Pide cancelar tu membresía",
        "Algunos gimnasios requieren aviso previo de 30 días",
        "Pide confirmación por escrito o email",
      ],
      en: [
        "Visit the gym in person OR call their phone number",
        "Ask to cancel your membership",
        "Some gyms require 30 days' notice",
        "Ask for confirmation in writing or by email",
      ],
    },
    link: "",
    linkLabel: { es: "Visita el gimnasio o llama directamente", en: "Visit the gym or call them directly" },
    minutes: "10-15",
  },
  geico: {
    steps: {
      es: [
        "Llama al 1-800-207-7847 (GEICO)",
        "O visita geico.com y ve a 'Mi Cuenta'",
        "Pide hablar con servicio al cliente",
        "Solicita cancelar la póliza",
        "Ten a mano tu número de póliza",
      ],
      en: [
        "Call 1-800-207-7847 (GEICO)",
        "Or visit geico.com and go to 'My Account'",
        "Ask to speak with customer service",
        "Request to cancel your policy",
        "Have your policy number handy",
      ],
    },
    link: "https://www.geico.com/account/",
    linkLabel: "geico.com/account",
    minutes: "10",
  },
  "state farm": {
    steps: {
      es: [
        "Llama a tu agente de State Farm directamente",
        "O llama al 1-800-SF-CLAIM",
        "Pide cancelar la póliza",
        "Ten a mano tu número de póliza",
      ],
      en: [
        "Call your State Farm agent directly",
        "Or call 1-800-SF-CLAIM",
        "Ask to cancel your policy",
        "Have your policy number handy",
      ],
    },
    link: "",
    linkLabel: { es: "Llama a tu agente directamente", en: "Call your agent directly" },
    minutes: "10",
  },
  progressive: {
    steps: {
      es: [
        "Llama al 1-800-776-4737",
        "O inicia sesión en progressive.com",
        "Ve a 'Mi Cuenta' > 'Pólizas'",
        "Selecciona 'Cancelar póliza'",
      ],
      en: [
        "Call 1-800-776-4737",
        "Or sign in at progressive.com",
        "Go to 'My Account' > 'Policies'",
        "Select 'Cancel policy'",
      ],
    },
    link: "https://www.progressive.com/account/",
    linkLabel: "progressive.com/account",
    minutes: "10",
  },
  verizon: {
    steps: {
      es: [
        "Ve a verizon.com/myverizon",
        "Inicia sesión",
        "Ve a 'Mi Plan' o 'Mi Cuenta'",
        "Para cambios grandes, llama al *611",
      ],
      en: [
        "Go to verizon.com/myverizon",
        "Sign in",
        "Go to 'My Plan' or 'My Account'",
        "For major changes, call *611",
      ],
    },
    link: "https://www.verizon.com/myverizon/",
    linkLabel: "verizon.com/myverizon",
    minutes: "10",
  },
  "at&t": {
    steps: {
      es: [
        "Ve a att.com/myatt e inicia sesión",
        "Ve a 'Mi Plan' o 'Gestionar cuenta'",
        "Para cancelar líneas, llama al 611 desde tu teléfono",
      ],
      en: [
        "Go to att.com/myatt and sign in",
        "Go to 'My Plan' or 'Manage account'",
        "To cancel lines, call 611 from your phone",
      ],
    },
    link: "https://www.att.com/myatt/",
    linkLabel: "att.com/myatt",
    minutes: "10",
  },
  "t-mobile": {
    steps: {
      es: [
        "Llama al 611 desde tu teléfono T-Mobile",
        "O al 1-877-453-1304",
        "Pide cancelar la línea o servicio",
        "Ten a mano tu PIN de cuenta",
      ],
      en: [
        "Call 611 from your T-Mobile phone",
        "Or call 1-877-453-1304",
        "Ask to cancel the line or service",
        "Have your account PIN handy",
      ],
    },
    link: "https://www.t-mobile.com/account",
    linkLabel: "t-mobile.com/account",
    minutes: "10",
  },
  "car wash": {
    steps: {
      es: [
        "Visita el car wash en persona",
        "Pide hablar con un administrador",
        "Solicita cancelar tu membresía",
        "Pide confirmación por escrito o email",
      ],
      en: [
        "Visit the car wash in person",
        "Ask to speak with a manager",
        "Request to cancel your membership",
        "Ask for confirmation in writing or by email",
      ],
    },
    link: "",
    linkLabel: { es: "Visita el establecimiento en persona", en: "Visit the location in person" },
    minutes: "10",
  },
  "new york times": {
    steps: {
      es: [
        "Ve a myaccount.nytimes.com",
        "Inicia sesión",
        "Ve a 'Suscripciones'",
        "Haz click en 'Cancelar suscripción'",
      ],
      en: [
        "Go to myaccount.nytimes.com",
        "Sign in",
        "Go to 'Subscriptions'",
        "Click 'Cancel subscription'",
      ],
    },
    link: "https://myaccount.nytimes.com/seg/subscription",
    linkLabel: "myaccount.nytimes.com",
    minutes: "3",
  },
  chatgpt: {
    steps: {
      es: [
        "Ve a chatgpt.com e inicia sesión",
        "Haz click en tu perfil (arriba a la derecha)",
        "Selecciona 'Mi plan' o 'My plan'",
        "Haz click en 'Gestionar mi suscripción'",
        "Selecciona 'Cancelar plan'",
        "Confirma la cancelación",
      ],
      en: [
        "Go to chatgpt.com and sign in",
        "Click your profile (top right)",
        "Select 'My plan'",
        "Click 'Manage my subscription'",
        "Select 'Cancel plan'",
        "Confirm the cancellation",
      ],
    },
    link: "https://chat.openai.com/account",
    linkLabel: "chat.openai.com/account",
    minutes: "3",
  },
  claude: {
    steps: {
      es: [
        "Ve a claude.ai e inicia sesión",
        "Haz click en tu perfil (arriba a la derecha)",
        "Selecciona 'Configuración' o 'Settings'",
        "Ve a 'Plan' o 'Billing'",
        "Haz click en 'Cancelar suscripción'",
        "Confirma la cancelación",
      ],
      en: [
        "Go to claude.ai and sign in",
        "Click your profile (top right)",
        "Select 'Settings'",
        "Go to 'Plan' or 'Billing'",
        "Click 'Cancel subscription'",
        "Confirm the cancellation",
      ],
    },
    link: "https://claude.ai/settings",
    linkLabel: "claude.ai/settings",
    minutes: "3",
  },
  kimi: {
    steps: {
      es: [
        "Ve a kimi.moonshot.cn e inicia sesión",
        "Ve a tu perfil o configuración de cuenta",
        "Busca 'Suscripción' o 'Plan de pago'",
        "Haz click en 'Cancelar suscripción'",
        "Confirma la cancelación",
      ],
      en: [
        "Go to kimi.moonshot.cn and sign in",
        "Go to your profile or account settings",
        "Look for 'Subscription' or 'Paid plan'",
        "Click 'Cancel subscription'",
        "Confirm the cancellation",
      ],
    },
    link: "https://kimi.moonshot.cn",
    linkLabel: "kimi.moonshot.cn",
    minutes: "3",
  },
  "amazon prime": {
    steps: {
      es: [
        "Ve a amazon.com e inicia sesión",
        "Ve a 'Tu Cuenta' > 'Gestionar membresía de Prime'",
        "Selecciona 'Actualizar, cancelar y más'",
        "Haz click en 'Finalizar membresía'",
        "Sigue los pasos para confirmar",
      ],
      en: [
        "Go to amazon.com and sign in",
        "Go to 'Your Account' > 'Manage Prime Membership'",
        "Select 'Update, cancel and more'",
        "Click 'End membership'",
        "Follow the steps to confirm",
      ],
    },
    link: "https://www.amazon.com/gp/primecentral",
    linkLabel: "amazon.com/primecentral",
    minutes: "3",
  },
};

const GENERIC_STEPS: Record<Lang, string[]> = {
  es: [
    "Busca el sitio web oficial del servicio",
    "Inicia sesión en tu cuenta",
    "Ve a 'Configuración', 'Cuenta' o 'Suscripción'",
    "Busca la opción de 'Cancelar' o 'Desactivar'",
    "Sigue los pasos de confirmación",
    "Guarda el email de confirmación de cancelación",
  ],
  en: [
    "Find the service's official website",
    "Sign in to your account",
    "Go to 'Settings', 'Account', or 'Subscription'",
    "Look for a 'Cancel' or 'Deactivate' option",
    "Follow the confirmation steps",
    "Save the cancellation confirmation email",
  ],
};

export function getCancelGuide(merchantName: string, lang: Lang): CancelGuide {
  const n = merchantName.toLowerCase();
  // Try exact match first
  for (const [key, guide] of Object.entries(GUIDES)) {
    if (n.includes(key)) {
      return {
        steps: guide.steps[lang],
        link: guide.link,
        linkLabel: typeof guide.linkLabel === "string" ? guide.linkLabel : guide.linkLabel[lang],
        estimatedTime: minutesLabel(guide.minutes, lang),
      };
    }
  }
  // Generic fallback
  const name = encodeURIComponent(merchantName);
  return {
    steps: GENERIC_STEPS[lang],
    link: lang === "es"
      ? `https://www.google.com/search?q=cancelar+${name}+suscripcion`
      : `https://www.google.com/search?q=how+to+cancel+${name}+subscription`,
    linkLabel: lang === "es" ? `Buscar cómo cancelar ${merchantName}` : `Google: how to cancel ${merchantName}`,
    estimatedTime: minutesLabel("5-10", lang),
  };
}
