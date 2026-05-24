/** Cancellation guides for popular subscription services */

export interface CancelGuide {
  steps: string[];
  link: string;
  linkLabel: string;
  estimatedTime: string;
}

const GUIDES: Record<string, CancelGuide> = {
  netflix: {
    steps: [
      "Inicia sesion en netflix.com",
      "Ve a Cuenta (icono de perfil arriba a la derecha)",
      "Selecciona 'Cuenta' o 'Account'",
      "Haz click en 'Cancelar membresia'",
      "Confirma la cancelacion",
    ],
    link: "https://www.netflix.com/cancelplan",
    linkLabel: "netflix.com/cancelplan",
    estimatedTime: "2 minutos",
  },
  spotify: {
    steps: [
      "Ve a spotify.com/account",
      "Inicia sesion con tu cuenta",
      "En el menu, selecciona 'Gestionar tu plan'",
      "Haz click en 'Cambiar o cancelar'",
      "Selecciona 'Cancelar Premium'",
      "Confirma la cancelacion",
    ],
    link: "https://www.spotify.com/account/change-plan/",
    linkLabel: "spotify.com/account",
    estimatedTime: "3 minutos",
  },
  disney: {
    steps: [
      "Ve a disneyplus.com e inicia sesion",
      "Haz click en tu perfil (arriba a la derecha)",
      "Selecciona 'Cuenta'",
      "Ve a 'Suscripcion' > 'Cancelar suscripcion'",
      "Sigue los pasos para confirmar",
    ],
    link: "https://www.disneyplus.com/account",
    linkLabel: "disneyplus.com/account",
    estimatedTime: "2 minutos",
  },
  hulu: {
    steps: [
      "Ve a hulu.com/account e inicia sesion",
      "Ve a 'Tu Cuenta'",
      "Selecciona 'Cancelar' junto a tu suscripcion",
      "Sigue los pasos para confirmar",
    ],
    link: "https://www.hulu.com/account",
    linkLabel: "hulu.com/account",
    estimatedTime: "2 minutos",
  },
  hbo: {
    steps: [
      "Ve a max.com e inicia sesion",
      "Haz click en tu perfil",
      "Selecciona 'Configuracion' > 'Suscripcion'",
      "Haz click en 'Gestionar suscripcion' > 'Cancelar'",
    ],
    link: "https://max.com/account",
    linkLabel: "max.com/account",
    estimatedTime: "2 minutos",
  },
  youtube: {
    steps: [
      "Ve a youtube.com/paid_memberships",
      "Inicia sesion con tu cuenta de Google",
      "Encuentra tu membresia y haz click en 'Gestionar'",
      "Selecciona 'Cancelar membresia'",
    ],
    link: "https://www.youtube.com/paid_memberships",
    linkLabel: "youtube.com/paid_memberships",
    estimatedTime: "2 minutos",
  },
  "apple music": {
    steps: [
      "En tu iPhone: Abre Configuracion > [Tu nombre] > Suscripciones",
      "Selecciona Apple Music",
      "Haz click en 'Cancelar suscripcion'",
      "O en la web: music.apple.com/account",
    ],
    link: "https://music.apple.com/account",
    linkLabel: "music.apple.com/account",
    estimatedTime: "2 minutos",
  },
  "apple tv": {
    steps: [
      "Ve a tv.apple.com e inicia sesion",
      "Ve a Configuracion de cuenta",
      "Selecciona 'Suscripciones' > 'Cancelar'",
    ],
    link: "https://tv.apple.com/settings",
    linkLabel: "tv.apple.com/settings",
    estimatedTime: "2 minutos",
  },
  paramount: {
    steps: [
      "Ve a paramountplus.com/account",
      "Inicia sesion",
      "Ve a 'Suscripcion' y selecciona 'Cancelar'",
    ],
    link: "https://www.paramountplus.com/account/",
    linkLabel: "paramountplus.com/account",
    estimatedTime: "2 minutos",
  },
  crunchyroll: {
    steps: [
      "Ve a crunchyroll.com/noble/settings",
      "Inicia sesion",
      "Ve a 'Configuracion de cuenta' > 'Premium'",
      "Haz click en 'Cancelar membresia'",
    ],
    link: "https://www.crunchyroll.com/noble/settings",
    linkLabel: "crunchyroll.com/settings",
    estimatedTime: "2 minutos",
  },
  amazon: {
    steps: [
      "Ve a amazon.com/appstoresubscriptions",
      "Inicia sesion",
      "Busca tu suscripcion (Prime, Music, etc.)",
      "Haz click en 'Gestionar' > 'Cancelar'",
    ],
    link: "https://www.amazon.com/appstoresubscriptions",
    linkLabel: "amazon.com/appstoresubscriptions",
    estimatedTime: "3 minutos",
  },
  adobe: {
    steps: [
      "Ve a account.adobe.com/plans",
      "Inicia sesion",
      "Selecciona el plan que quieres cancelar",
      "Haz click en 'Gestionar plan' > 'Cancelar plan'",
    ],
    link: "https://account.adobe.com/plans",
    linkLabel: "account.adobe.com/plans",
    estimatedTime: "3 minutos",
  },
  microsoft: {
    steps: [
      "Ve a account.microsoft.com/services",
      "Inicia sesion",
      "Encuentra Microsoft 365",
      "Haz click en 'Gestionar' > 'Cancelar suscripcion'",
    ],
    link: "https://account.microsoft.com/services/",
    linkLabel: "account.microsoft.com/services",
    estimatedTime: "3 minutos",
  },
  gym: {
    steps: [
      "Visita el gimnasio en persona O llama al numero de telefono",
      "Pide cancelar tu membresia",
      "Algunos gimnasios requieren aviso previo de 30 dias",
      "Pide confirmacion por escrito o email",
    ],
    link: "",
    linkLabel: "Visita el gimnasio o llama directamente",
    estimatedTime: "10-15 minutos",
  },
  geico: {
    steps: [
      "Llama al 1-800-207-7847 (GEICO)",
      "O visita geico.com y ve a 'Mi Cuenta'",
      "Pide hablar con servicio al cliente",
      "Solicita cancelar la poliza",
      "Ten a mano tu numero de poliza",
    ],
    link: "https://www.geico.com/account/",
    linkLabel: "geico.com/account",
    estimatedTime: "10 minutos",
  },
  "state farm": {
    steps: [
      "Llama a tu agente de State Farm directamente",
      "O llama al 1-800-SF-CLAIM",
      "Pide cancelar la poliza",
      "Ten a mano tu numero de poliza",
    ],
    link: "",
    linkLabel: "Llama a tu agente directamente",
    estimatedTime: "10 minutos",
  },
  progressive: {
    steps: [
      "Llama al 1-800-776-4737",
      "O inicia sesion en progressive.com",
      "Ve a 'Mi Cuenta' > 'Polizas'",
      "Selecciona 'Cancelar poliza'",
    ],
    link: "https://www.progressive.com/account/",
    linkLabel: "progressive.com/account",
    estimatedTime: "10 minutos",
  },
  verizon: {
    steps: [
      "Ve a verizon.com/myverizon",
      "Inicia sesion",
      "Ve a 'Mi Plan' o 'Mi Cuenta'",
      "Para cambios grandes, llama al *611",
    ],
    link: "https://www.verizon.com/myverizon/",
    linkLabel: "verizon.com/myverizon",
    estimatedTime: "10 minutos",
  },
  "at&t": {
    steps: [
      "Ve a att.com/myatt e inicia sesion",
      "Ve a 'Mi Plan' o 'Gestionar cuenta'",
      "Para cancelar lineas, llama al 611 desde tu telefono",
    ],
    link: "https://www.att.com/myatt/",
    linkLabel: "att.com/myatt",
    estimatedTime: "10 minutos",
  },
  "t-mobile": {
    steps: [
      "Llama al 611 desde tu telefono T-Mobile",
      "O al 1-877-453-1304",
      "Pide cancelar la linea o servicio",
      "Ten a mano tu PIN de cuenta",
    ],
    link: "https://www.t-mobile.com/account",
    linkLabel: "t-mobile.com/account",
    estimatedTime: "10 minutos",
  },
  "car wash": {
    steps: [
      "Visita el car wash en persona",
      "Pide hablar con un administrador",
      "Solicita cancelar tu membresia",
      "Pide confirmacion por escrito o email",
    ],
    link: "",
    linkLabel: "Visita el establecimiento en persona",
    estimatedTime: "10 minutos",
  },
  "new york times": {
    steps: [
      "Ve a myaccount.nytimes.com",
      "Inicia sesion",
      "Ve a 'Suscripciones'",
      "Haz click en 'Cancelar suscripcion'",
    ],
    link: "https://myaccount.nytimes.com/seg/subscription",
    linkLabel: "myaccount.nytimes.com",
    estimatedTime: "3 minutos",
  },
};

export function getCancelGuide(merchantName: string): CancelGuide {
  const n = merchantName.toLowerCase();
  // Try exact match first
  for (const [key, guide] of Object.entries(GUIDES)) {
    if (n.includes(key)) return guide;
  }
  // Generic fallback
  return {
    steps: [
      "Busca el sitio web oficial del servicio",
      "Inicia sesion en tu cuenta",
      "Ve a 'Configuracion', 'Cuenta' o 'Suscripcion'",
      "Busca la opcion de 'Cancelar' o 'Desactivar'",
      "Sigue los pasos de confirmacion",
      "Guarda el email de confirmacion de cancelacion",
    ],
    link: `https://www.google.com/search?q=cancelar+${encodeURIComponent(merchantName)}+suscripcion`,
    linkLabel: `Buscar como cancelar ${merchantName}`,
    estimatedTime: "5-10 minutos",
  };
}
