// The emails the client gets as their return moves along the 8 steps ("Recibimos tus documentos", "Tu declaración
// está lista para firmar", "El IRS aceptó tu declaración"…). Short, in the client's language, with a little
// tracker of the 8 steps and a button to the app. For safety they carry no amounts and no personal data.
import { TAX_STEP, TAX_STEP_COUNT } from "@contracts/taxRules";
import { appBaseUrl, brandedHtml, escapeHtml, mailList, mailP, type Mail } from "./mailer";

const ACCENT = "#2563eb", LINE = "#e2e8f0", MUTED = "#64748b";

const STEP_NAMES: Record<"es" | "en", string[]> = {
  es: ["Recibida", "Revisión", "Preparando", "Firma", "Enviada", "Aceptada", "Reembolso", "Depositado"],
  en: ["Received", "Review", "Preparing", "Sign", "Filed", "Accepted", "Refund", "Deposited"],
};

/** The 8 steps as small bars, the ones done in blue, and "Paso 4 de 8 · Firma" under them. */
export function mailTracker(step: number, lang: "es" | "en"): string {
  const bars = Array.from({ length: TAX_STEP_COUNT }, (_, i) =>
    `<td width="${Math.floor(100 / TAX_STEP_COUNT)}%" style="padding:0 2px"><div style="height:6px;line-height:6px;font-size:0;border-radius:6px;background:${i <= step ? ACCENT : LINE}">&nbsp;</div></td>`).join("");
  const label = lang === "en" ? `Step ${step + 1} of ${TAX_STEP_COUNT} · ${STEP_NAMES.en[step]}` : `Paso ${step + 1} de ${TAX_STEP_COUNT} · ${STEP_NAMES.es[step]}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px"><tr>${bars}</tr></table>` +
    `<p style="margin:0 0 18px;font-size:12px;font-weight:600;color:${MUTED}">${escapeHtml(label)}</p>`;
}

export type StepMailInfo = {
  to: string;
  lang: "es" | "en";
  firstName: string;
  preparer: string;
  mode: "business" | "personal";
  /** What the return came out to (only whether there's a refund or something to pay, never the amount). */
  refund: boolean;
  owe: boolean;
  /** The filing deadline, already written for people (e.g. "15 de abril de 2027"). */
  deadline: string;
};

type Words = { subject: string; title: string; preheader: string; body: string[]; list?: string[]; button: string };

function words(step: number, i: StepMailInfo): Words | null {
  const es = i.lang !== "en";
  const p = i.preparer;
  switch (step) {
    case TAX_STEP.received:
      return es
        ? { subject: "Recibimos tus documentos", title: "Recibimos tus documentos", preheader: `${p} ya los tiene y te avisa en cada paso.`, button: "Ver mi declaración",
            body: [`${p}, tu preparador, ya tiene todo lo que mandaste. Lo va a revisar y te escribimos por correo en cada paso.`, "Si necesita algo más, te lo pide en la app."] }
        : { subject: "We received your documents", title: "We received your documents", preheader: `${p} has them and will let you know at every step.`, button: "See my return",
            body: [`${p}, your preparer, has everything you sent. They'll review it and we'll email you at every step.`, "If they need anything else, they'll ask in the app."] };
    case TAX_STEP.reviewing:
      return es
        ? { subject: `${p} está revisando tus documentos`, title: "Estamos revisando tus documentos", preheader: "Si falta algo o una foto no se ve bien, te avisa en la app.", button: "Ver mi declaración",
            body: [`${p} está revisando que tus documentos se lean bien y que no falte nada.`, "Si falta algo o una foto no se ve bien, te lo pide en la app."] }
        : { subject: `${p} is reviewing your documents`, title: "We're reviewing your documents", preheader: "If something is missing or a photo isn't clear, they'll ask in the app.", button: "See my return",
            body: [`${p} is checking that your documents are readable and nothing is missing.`, "If something is missing or a photo isn't clear, they'll ask in the app."] };
    case TAX_STEP.preparing:
      return es
        ? { subject: `${p} está preparando tu declaración`, title: "Estamos preparando tu declaración", preheader: "Te avisamos cuando esté lista para firmar.", button: "Ver mi declaración",
            body: ["Tus documentos están bien.", `Ahora ${p} prepara tu declaración federal y la de Alabama. Te avisamos cuando esté lista para que la revises y la firmes.`] }
        : { subject: `${p} is preparing your return`, title: "We're preparing your return", preheader: "We'll let you know when it's ready to sign.", button: "See my return",
            body: ["Your documents are fine.", `Now ${p} is preparing your federal and Alabama returns. We'll let you know when it's ready for you to review and sign.`] };
    case TAX_STEP.sign:
      return es
        ? { subject: "Tu declaración está lista para firmar", title: "Tu declaración está lista para firmar", preheader: "Revísala en la app y firma la autorización 8879.", button: "Revisar y firmar",
            body: ["Revísala en la app y firma la autorización de e-file (Formulario 8879). Hasta que la firmes, no se presenta.", "Puedes firmarla de dos formas:"],
            list: [`En la oficina con ${p}: lleva tu identificación con foto y firmas en tu teléfono.`, "En papel desde tu casa: descarga el 8879, fírmalo a mano y sube una foto."] }
        : { subject: "Your return is ready to sign", title: "Your return is ready to sign", preheader: "Review it in the app and sign the 8879 authorization.", button: "Review and sign",
            body: ["Review it in the app and sign the e-file authorization (Form 8879). It isn't filed until you sign it.", "You can sign it two ways:"],
            list: [`At the office with ${p}: bring your photo ID and sign on your phone.`, "On paper from home: download the 8879, sign it by hand and upload a photo."] };
    case TAX_STEP.filed:
      return es
        ? { subject: "Presentamos tu declaración", title: "Presentamos tu declaración", preheader: "Te avisamos cuando el IRS y Alabama la acepten.", button: "Ver mi declaración",
            body: [`${p} presentó tu declaración al IRS y a Alabama por e-file.`, "Normalmente la aceptan en pocos días. Te avisamos por correo."] }
        : { subject: "We filed your return", title: "We filed your return", preheader: "We'll let you know when the IRS and Alabama accept it.", button: "See my return",
            body: [`${p} filed your return with the IRS and Alabama by e-file.`, "They usually accept it within a few days. We'll email you."] };
    case TAX_STEP.accepted:
      return es
        ? { subject: "El IRS aceptó tu declaración", title: "¡Aceptaron tu declaración!", preheader: i.owe ? `Recuerda pagar antes del ${i.deadline}.` : i.refund ? "Ahora sigue tu reembolso." : "No tienes que hacer nada más.", button: "Ver mi declaración",
            body: ["El IRS y Alabama confirmaron que recibieron tu declaración.",
              ...(i.owe ? [`Lo que te toca pagar, págalo antes del ${i.deadline}. En la app ves cuánto y cómo.`] : []),
              ...(i.refund ? ["Ahora sigue tu reembolso. Te avisamos cuando vaya en camino."] : []),
              ...(!i.owe && !i.refund ? ["No tienes que hacer nada más."] : [])] }
        : { subject: "The IRS accepted your return", title: "Your return was accepted!", preheader: i.owe ? `Remember to pay by ${i.deadline}.` : i.refund ? "Next comes your refund." : "There's nothing else you need to do.", button: "See my return",
            body: ["The IRS and Alabama confirmed they received your return.",
              ...(i.owe ? [`Pay what you owe by ${i.deadline}. The app shows how much and how.`] : []),
              ...(i.refund ? ["Next comes your refund. We'll let you know when it's on its way."] : []),
              ...(!i.owe && !i.refund ? ["There's nothing else you need to do."] : [])] };
    case TAX_STEP.refundSent:
      if (!i.refund) return null;
      return es
        ? { subject: "Tu reembolso va en camino", title: "Tu reembolso va en camino", preheader: "La mayoría de los reembolsos llegan en menos de 21 días.", button: "Seguir mi reembolso",
            body: ["El IRS ya aprobó tu reembolso. Según el IRS, la mayoría llegan en menos de 21 días.", "En la app tienes los enlaces para seguirlo, el federal y el de Alabama."] }
        : { subject: "Your refund is on its way", title: "Your refund is on its way", preheader: "Most refunds arrive in less than 21 days.", button: "Track my refund",
            body: ["The IRS approved your refund. According to the IRS, most arrive in less than 21 days.", "The app has the links to track it, federal and Alabama."] };
    case TAX_STEP.deposited:
      if (!i.refund) return null;
      return es
        ? { subject: "Tu reembolso ya llegó", title: "Tu reembolso ya llegó", preheader: "Revisa tu cuenta del banco.", button: "Ver mi declaración",
            body: ["Tu reembolso ya se depositó. Revisa tu cuenta del banco.", `Gracias por confiar en nosotros. ${p} y el equipo te esperan el próximo año.`] }
        : { subject: "Your refund has arrived", title: "Your refund has arrived", preheader: "Check your bank account.", button: "See my return",
            body: ["Your refund was deposited. Check your bank account.", `Thank you for trusting us. ${p} and the team will see you next year.`] };
    default:
      return null;
  }
}

/** The email for a step, or null when that step sends none (refund steps when there's no refund). */
export function taxStepMail(step: number, i: StepMailInfo): Mail | null {
  const w = words(step, i);
  if (!w) return null;
  const es = i.lang !== "en";
  const name = i.firstName.trim();
  const hi = es ? `Hola${name ? ` ${name}` : ""}` : `Hi${name ? ` ${name}` : ""}`;
  const url = `${appBaseUrl()}${i.mode === "personal" ? "/personal/taxes" : "/taxes"}`;
  const footer = es
    ? "Te escribimos porque tu declaración cambió de paso. Por seguridad, estos correos no llevan montos ni datos personales: todo está en la app."
    : "We're writing because your return moved to a new step. For your safety, these emails carry no amounts or personal data: it's all in the app.";
  const text = [`${hi},`, "", ...w.body, ...(w.list ?? []).map((l) => `- ${l}`), "", `${w.button}: ${url}`, "", footer].join("\n");
  return {
    to: i.to,
    subject: w.subject,
    text,
    html: brandedHtml({
      lang: i.lang,
      title: w.title,
      preheader: w.preheader,
      body: mailTracker(step, i.lang) + mailP(`${escapeHtml(hi)},`) + w.body.map((b) => mailP(escapeHtml(b))).join("") + (w.list ? mailList(w.list) : ""),
      button: { label: w.button, url },
      footer: escapeHtml(footer),
    }),
  };
}
