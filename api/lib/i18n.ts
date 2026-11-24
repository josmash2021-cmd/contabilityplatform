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
    taxBadSignature: "Dibuja tu firma en el recuadro y vuelve a intentarlo.",
    taxNameMismatch: "Tu nombre no coincide con el de tu declaración. Escríbelo completo, como en tu identificación.",
    taxNeedInPerson: "Para firmar aquí, tu preparador tiene que revisar tu identificación en persona y abrir la firma. También puedes firmar en papel.",
    taxIdCheckName: "El nombre de la identificación no coincide con el nombre de la declaración. Corrige uno de los dos.",
    taxIdCheckBad: "Revisa los datos: el SSN o ITIN tiene 9 números (el ITIN empieza con 9) y la fecha de nacimiento tiene que ser real.",
    taxIdCheckNone: "Primero guarda la identificación que revisaste en persona.",
    taxPaperNotNow: "El 8879 firmado a mano se sube cuando tu declaración está en Revisa y firma.",
    taxTooBig: "El archivo pesa más de 10 MB.",
    taxTooMany: "Ya subiste 10 archivos para este documento.",
    taxLocked: "Tu declaración ya se envió al IRS; ya no se pueden cambiar documentos.",
    taxNotReady: "Todavía falta algo para enviar. Revisa la lista de documentos.",
    taxNotFound: "No encontramos ese documento.",
    taxStepNeedsDocs: "Para pasar a Revisa y firma, primero sube el 1040 y el 8879 de este cliente.",
    taxStepNeedsSignature: "Todavía no se puede pasar a Enviada: falta que el cliente firme el 8879.",
    taxNo8879: "Tu preparador todavía no ha subido el Formulario 8879 para firmar.",
    maintenance: "Estamos haciendo mantenimiento: por ahora no se pueden guardar cambios. Tus datos están seguros; intenta en unos minutos.",
    maintenanceNotSaved: "No se pudo guardar el modo mantenimiento. Intenta otra vez.",
    planMissingFeature: "Tu plan no incluye esta función. Puedes cambiar de plan en Ajustes.",
    assistantQuota: "Ya usaste todas las preguntas de este mes. Se renuevan el día 1, o puedes cambiar de plan en Ajustes.",
    assistantNotReady: "El asistente se está activando. Inténtalo en unos minutos.",
    assistantError: "No pude contestar ahora. Inténtalo de nuevo en un momento.",
    assistantBusy: "Hay muchas preguntas en este momento. Inténtalo en un minuto.",
    assistantFileTooBig: "Ese archivo es muy grande. Las fotos pueden pesar hasta 5 MB y los PDF hasta 10 MB.",
    assistantFileOnly: "Revisa este archivo y dime lo importante.",
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
    taxBadSignature: "Draw your signature in the box and try again.",
    taxNameMismatch: "Your name doesn't match the one on your return. Type it in full, as on your ID.",
    taxNeedInPerson: "To sign here, your preparer has to check your ID in person and open the signature. You can also sign on paper.",
    taxIdCheckName: "The name on the ID doesn't match the name on the return. Fix one of them.",
    taxIdCheckBad: "Check the details: the SSN or ITIN has 9 digits (an ITIN starts with 9) and the date of birth has to be real.",
    taxIdCheckNone: "First save the ID you checked in person.",
    taxPaperNotNow: "The hand-signed 8879 is uploaded when your return is at Review and sign.",
    taxTooBig: "The file is larger than 10 MB.",
    taxTooMany: "You already uploaded 10 files for this document.",
    taxLocked: "Your return was already sent to the IRS; documents can't change anymore.",
    taxNotReady: "Something is still missing before you can send. Check the document list.",
    taxNotFound: "We couldn't find that document.",
    taxStepNeedsDocs: "To move to Review & sign, first upload this client's 1040 and 8879.",
    taxStepNeedsSignature: "It can't move to Filed yet: the client still has to sign the 8879.",
    taxNo8879: "Your preparer hasn't uploaded Form 8879 to sign yet.",
    maintenance: "We're doing maintenance: changes can't be saved right now. Your data is safe; try again in a few minutes.",
    maintenanceNotSaved: "Maintenance mode couldn't be saved. Try again.",
    planMissingFeature: "Your plan doesn't include this feature. You can change your plan in Settings.",
    assistantQuota: "You've used all of this month's questions. They renew on the 1st, or you can change your plan in Settings.",
    assistantNotReady: "The assistant is being set up. Please try again in a few minutes.",
    assistantError: "I couldn't answer right now. Please try again in a moment.",
    assistantBusy: "There are many questions right now. Please try again in a minute.",
    assistantFileTooBig: "That file is too big. Photos can be up to 5 MB and PDFs up to 10 MB.",
    assistantFileOnly: "Look at this file and tell me what matters.",
    assistantDeclined: "I can't help with that. Ask me about your income, spending, sales or goals.",
  },
} as const;

export type MessageKey = keyof (typeof messages)["es"];

export function msg(lang: Lang, key: MessageKey): string {
  return messages[lang][key];
}
