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
  },
} as const;

export type MessageKey = keyof (typeof messages)["es"];

export function msg(lang: Lang, key: MessageKey): string {
  return messages[lang][key];
}
