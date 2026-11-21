// Email the app sends (password codes, the Monday summary), through the owner's own mailbox over SMTP.
// Free with a Gmail account and an app password: in Railway set SMTP_USER (the Gmail address) and SMTP_PASS
// (the 16-letter app password). SMTP_HOST / SMTP_PORT default to Gmail's; MAIL_FROM_NAME to the app's name.
// Without them nothing is sent and callers carry on (mailReady() says so). Addresses never go to the logs.
import nodemailer, { type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string; html?: string };

let transport: Transporter | null = null;

/** True when the server has a mailbox to send from. */
export function mailReady(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporter(): Transporter | null {
  if (!mailReady()) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_PASS || "").replace(/\s+/g, "") },
      // A slow mail server never holds a request for long.
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 20_000,
    });
  }
  return transport;
}

/** Sends one email. Returns true when the mail server took it; never throws. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const t = transporter();
  if (!t) return false;
  try {
    const name = (process.env.MAIL_FROM_NAME || "Personal & Business Solutions").replace(/["\r\n]/g, "");
    await t.sendMail({ from: `"${name}" <${process.env.SMTP_USER}>`, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    return true;
  } catch (e: unknown) {
    // The reason only (auth failed, timeout…), never who it was for.
    console.error("[mail] not sent:", e instanceof Error ? e.message.replace(/\S+@\S+/g, "<address>") : "error");
    return false;
  }
}

/** Escapes text for the HTML version of an email. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** A plain, readable email body: a title, paragraphs and an optional button, in the app's colors. */
export function simpleHtml(title: string, paragraphs: string[], button?: { label: string; url: string }, footer?: string): string {
  const p = paragraphs.map((x) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#0f172a">${x}</p>`).join("");
  const b = button
    ? `<p style="margin:18px 0"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 18px;border-radius:10px">${escapeHtml(button.label)}</a></p>`
    : "";
  const f = footer ? `<p style="margin:18px 0 0;font-size:12px;color:#64748b">${footer}</p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">` +
    `<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:24px">` +
    `<h1 style="margin:0 0 14px;font-size:20px;color:#0f172a">${escapeHtml(title)}</h1>${p}${b}${f}</div></body></html>`;
}
