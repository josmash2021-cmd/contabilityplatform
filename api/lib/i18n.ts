// Server-side messages shown to users (toasts). The client sends its language
// in the x-lang header (see src/providers/trpc.tsx).

export type Lang = "es" | "en";

export function langFromHeaders(headers: Headers): Lang {
  const v = (headers.get("x-lang") || "").toLowerCase();
  if (v === "en" || v === "es") return v;
  return (headers.get("accept-language") || "").toLowerCase().startsWith("es") ? "es" : "en";
}

const messages = {
  es: {
    emailExists: "Ya existe una cuenta con este email",
    badCredentials: "Email o contraseña incorrectos",
    socialAccount: "Esta cuenta usa inicio de sesión social",
    noPersonalMode: "Esta cuenta no tiene acceso al modo Personal. Inicia sesión como Negocio.",
    tooManyLogins: "Demasiados intentos de inicio de sesión. Intenta en 15 minutos.",
    tooManyCodes: "Demasiados intentos. Intenta en una hora.",
    tooManyGuesses: "Demasiados intentos. Solicita un código nuevo.",
    codeSentIfExists: "Si el correo está registrado, recibirás un código",
    invalidCode: "Código inválido o expirado",
    codeVerified: "Código verificado",
    passwordUpdated: "Contraseña actualizada",
    taxNoPlan: "Impuestos está incluido en los planes Pro y Negocio. Cambia de plan en Ajustes.",
    taxNoKey: "Todavía no podemos guardar documentos de impuestos. Inténtalo más tarde.",
    taxBadFile: "Sube una foto (JPG, PNG, HEIC) o un PDF.",
    taxTooBig: "El archivo pesa más de 10 MB.",
    taxTooMany: "Ya subiste 10 archivos para este documento.",
    taxLocked: "Tu declaración ya se envió al IRS; ya no se pueden cambiar documentos.",
    taxNotReady: "Todavía falta algo para enviar. Revisa la lista de documentos.",
    taxNotFound: "No encontramos ese documento.",
    planMissingFeature: "Tu plan no incluye esta función. Puedes cambiar de plan en Ajustes.",
    assistantQuota: "Ya usaste todas las preguntas de este mes. Se renuevan el día 1, o puedes cambiar de plan en Ajustes.",
    assistantNotReady: "El asistente se está activando. Inténtalo en unos minutos.",
    assistantError: "No pude contestar ahora. Inténtalo de nuevo en un momento.",
    assistantBusy: "Hay muchas preguntas en este momento. Inténtalo en un minuto.",
    assistantDeclined: "No puedo ayudar con eso. Pregúntame sobre tus ingresos, gastos, ventas o metas.",
  },
  en: {
    emailExists: "An account with this email already exists",
    badCredentials: "Incorrect email or password",
    socialAccount: "This account uses social sign-in",
    noPersonalMode: "This account doesn't have Personal access. Log in as Business.",
    tooManyLogins: "Too many login attempts. Try again in 15 minutes.",
    tooManyCodes: "Too many attempts. Try again in an hour.",
    tooManyGuesses: "Too many attempts. Request a new code.",
    codeSentIfExists: "If the email is registered, you'll receive a code",
    invalidCode: "Invalid or expired code",
    codeVerified: "Code verified",
    passwordUpdated: "Password updated",
    taxNoPlan: "Taxes is included in the Pro and Business plans. Change your plan in Settings.",
    taxNoKey: "We can't store tax documents yet. Please try again later.",
    taxBadFile: "Upload a photo (JPG, PNG, HEIC) or a PDF.",
    taxTooBig: "The file is larger than 10 MB.",
    taxTooMany: "You already uploaded 10 files for this document.",
    taxLocked: "Your return was already sent to the IRS; documents can't change anymore.",
    taxNotReady: "Something is still missing before you can send. Check the document list.",
    taxNotFound: "We couldn't find that document.",
    planMissingFeature: "Your plan doesn't include this feature. You can change your plan in Settings.",
    assistantQuota: "You've used all of this month's questions. They renew on the 1st, or you can change your plan in Settings.",
    assistantNotReady: "The assistant is being set up. Please try again in a few minutes.",
    assistantError: "I couldn't answer right now. Please try again in a moment.",
    assistantBusy: "There are many questions right now. Please try again in a minute.",
    assistantDeclined: "I can't help with that. Ask me about your income, spending, sales or goals.",
  },
} as const;

export type MessageKey = keyof (typeof messages)["es"];

export function msg(lang: Lang, key: MessageKey): string {
  return messages[lang][key];
}
