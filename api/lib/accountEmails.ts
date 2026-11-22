// The account emails the app sends, built in one place so what's sent and what's previewed are the same.
import { escapeHtml, simpleHtml, type Mail } from "./mailer";

/** "Olvidé mi contraseña": the 6-digit code, valid for 30 minutes. */
export function resetCodeMail(to: string, lang: "es" | "en", firstName: string, code: string): Mail {
  const es = lang !== "en";
  const name = firstName.trim();
  return {
    to,
    subject: es ? `Tu código para cambiar la contraseña: ${code}` : `Your code to change your password: ${code}`,
    text: es
      ? `Hola${name ? ` ${name}` : ""},\n\nTu código es ${code}. Escríbelo en la app para crear una contraseña nueva. Vence en 30 minutos.\n\nSi no lo pediste tú, ignora este correo: tu contraseña no cambia.`
      : `Hi${name ? ` ${name}` : ""},\n\nYour code is ${code}. Enter it in the app to create a new password. It expires in 30 minutes.\n\nIf you didn't ask for it, ignore this email: your password doesn't change.`,
    html: simpleHtml(
      es ? "Tu código para cambiar la contraseña" : "Your code to change your password",
      [
        es ? `Hola${name ? ` ${escapeHtml(name)}` : ""}, escribe este código en la app para crear una contraseña nueva:` : `Hi${name ? ` ${escapeHtml(name)}` : ""}, enter this code in the app to create a new password:`,
        `<span style="display:inline-block;font-size:28px;font-weight:700;letter-spacing:6px;background:#f1f5f9;border-radius:10px;padding:10px 16px">${code}</span>`,
        es ? "Vence en 30 minutos." : "It expires in 30 minutes.",
      ],
      undefined,
      es ? "Si no lo pediste tú, ignora este correo: tu contraseña no cambia." : "If you didn't ask for it, ignore this email: your password doesn't change.",
    ),
  };
}
