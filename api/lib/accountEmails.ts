// The account emails the app sends, built in one place so what's sent and what's previewed are the same.
import { brandedHtml, escapeHtml, mailCode, mailNote, mailP, type Mail } from "./mailer";

/** "Primero, confirma que eres tú": the 6-digit code that opens Impuestos, valid for 10 minutes. */
export function taxCodeMail(to: string, lang: "es" | "en", firstName: string, code: string): Mail {
  const es = lang !== "en";
  const name = firstName.trim();
  const hi = es ? `Hola${name ? ` ${name}` : ""}` : `Hi${name ? ` ${name}` : ""}`;
  const security = es
    ? "Nadie de Personal & Business Solutions te va a pedir este código: no lo compartas con nadie. Si no fuiste tú, cambia tu contraseña en Ajustes."
    : "No one from Personal & Business Solutions will ever ask you for this code: don't share it. If it wasn't you, change your password in Settings.";
  return {
    to,
    subject: es ? `Tu código para abrir Impuestos: ${code}` : `Your code to open Taxes: ${code}`,
    text: es
      ? `${hi},\n\nTu código para abrir Impuestos es ${code}. Vence en 10 minutos.\n\nLo pedimos porque ahí guardas documentos como tu Seguro Social o tu ITIN.\n\n${security}`
      : `${hi},\n\nYour code to open Taxes is ${code}. It expires in 10 minutes.\n\nWe ask for it because that's where you keep documents like your Social Security card or ITIN.\n\n${security}`,
    html: brandedHtml({
      lang,
      title: es ? "Tu código para abrir Impuestos" : "Your code to open Taxes",
      preheader: es ? `Tu código es ${code}. Vence en 10 minutos.` : `Your code is ${code}. It expires in 10 minutes.`,
      body:
        mailP(`${escapeHtml(hi)}, ${es ? "escribe este código en la app para abrir Impuestos:" : "enter this code in the app to open Taxes:"}`) +
        mailCode(code) +
        mailP(es
          ? "Vence en <b>10 minutos</b>. Lo pedimos porque ahí guardas documentos como tu Seguro Social o tu ITIN."
          : "It expires in <b>10 minutes</b>. We ask for it because that's where you keep documents like your Social Security card or ITIN.") +
        mailNote(`<b>${es ? "Cuida tu cuenta." : "Keep your account safe."}</b> ${escapeHtml(security)}`),
    }),
  };
}

/** "Olvidé mi contraseña": the 6-digit code, valid for 30 minutes. */
export function resetCodeMail(to: string, lang: "es" | "en", firstName: string, code: string): Mail {
  const es = lang !== "en";
  const name = firstName.trim();
  const hi = es ? `Hola${name ? ` ${name}` : ""}` : `Hi${name ? ` ${name}` : ""}`;
  const title = es ? "Tu código para cambiar la contraseña" : "Your code to change your password";
  const security = es
    ? "Nadie de Personal & Business Solutions te va a pedir este código: no lo compartas con nadie. Si no lo pediste tú, ignora este correo; tu contraseña no cambia."
    : "No one from Personal & Business Solutions will ever ask you for this code: don't share it. If you didn't ask for it, ignore this email; your password doesn't change.";
  return {
    to,
    subject: es ? `Tu código para cambiar la contraseña: ${code}` : `Your code to change your password: ${code}`,
    text: es
      ? `${hi},\n\nTu código es ${code}. Escríbelo en la app para crear una contraseña nueva. Vence en 30 minutos.\n\n${security}`
      : `${hi},\n\nYour code is ${code}. Enter it in the app to create a new password. It expires in 30 minutes.\n\n${security}`,
    html: brandedHtml({
      lang,
      title,
      preheader: es ? `Tu código es ${code}. Vence en 30 minutos.` : `Your code is ${code}. It expires in 30 minutes.`,
      body:
        mailP(`${escapeHtml(hi)}, ${es ? "escribe este código en la app para crear una contraseña nueva:" : "enter this code in the app to create a new password:"}`) +
        mailCode(code) +
        mailP(es ? "Vence en <b>30 minutos</b>. Si se te pasa, pide otro en «Olvidé mi contraseña»." : "It expires in <b>30 minutes</b>. If it does, ask for another one in “Forgot my password”.") +
        mailNote(`<b>${es ? "Cuida tu cuenta." : "Keep your account safe."}</b> ${escapeHtml(security)}`),
    }),
  };
}
