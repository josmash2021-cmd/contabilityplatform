// Email the app sends (password codes, the Monday summary), through the owner's own mailbox over SMTP.
// Free with a Gmail account and an app password: in Railway set SMTP_USER (the Gmail address) and SMTP_PASS
// (the 16-letter app password). SMTP_HOST / SMTP_PORT default to Gmail's; MAIL_FROM_NAME to the app's name.
// Without them nothing is sent and callers carry on (mailReady() says so). Addresses never go to the logs.
import nodemailer, { type Transporter } from "nodemailer";

export type MailFile = { filename: string; content: Uint8Array; contentType: string };
export type Mail = { to: string; subject: string; text: string; html?: string; attachments?: MailFile[] };

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
    await t.sendMail({
      from: `"${name}" <${process.env.SMTP_USER}>`, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html,
      attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
    });
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

/** The app's address, for links and the logo in emails. */
export function appBaseUrl(): string {
  return (process.env.APP_URL || "https://aethelaccountingplatform.com").replace(/\/+$/, "");
}

// ── The look of every email ──
// Built with tables and inline styles, the only layout every mail app (Gmail, Outlook, Apple Mail) draws the same.
const INK = "#0f172a", MUTED = "#64748b", LINE = "#e2e8f0", SOFT = "#f8fafc", ACCENT = "#2563eb", GOOD = "#059669", BAD = "#dc2626";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** A paragraph of the email (the text is already escaped). */
export const mailP = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:${INK}">${html}</p>`;

/** A list of short lines (escaped here). */
export const mailList = (lines: string[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${lines.map((l) =>
    `<tr><td width="18" valign="top" style="padding:2px 0 8px;font-size:15px;line-height:1.5;color:${ACCENT}">&#8226;</td><td style="padding:2px 0 8px;font-size:15px;line-height:1.5;color:${INK}">${escapeHtml(l)}</td></tr>`).join("")}</table>`;

export type MailTile = { label: string; value: string; line?: string; good?: boolean | null };
/** Big numbers, two per row (an odd last one takes the whole row). */
export function mailTiles(tiles: MailTile[]): string {
  const cell = (t: MailTile, span = 1) => `<td colspan="${span}" width="${span === 2 ? "100%" : "50%"}" valign="top" style="padding:4px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};border:1px solid ${LINE};border-radius:12px"><tr><td style="padding:12px 14px">` +
    `<div style="font-size:12px;color:${MUTED}">${escapeHtml(t.label)}</div>` +
    `<div style="font-size:22px;line-height:1.25;font-weight:700;color:${INK};padding-top:2px">${escapeHtml(t.value)}</div>` +
    (t.line ? `<div style="font-size:12px;color:${t.good === true ? GOOD : t.good === false ? BAD : MUTED};padding-top:2px">${escapeHtml(t.line)}</div>` : "") +
    `</td></tr></table></td>`;
  const rows: string[] = [];
  for (let i = 0; i < tiles.length; i += 2) {
    rows.push(i + 1 < tiles.length ? `<tr>${cell(tiles[i])}${cell(tiles[i + 1])}</tr>` : `<tr>${cell(tiles[i], 2)}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${rows.join("")}</table>`;
}

/** The files that come with the email: a colored badge, the name and what it's for. */
export function mailFiles(title: string, files: Array<{ kind: "PDF" | "XLS"; name: string; note: string }>): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;border:1px solid ${LINE};border-radius:12px">` +
    `<tr><td colspan="2" style="padding:12px 14px 4px;font-size:13px;font-weight:600;color:${INK}">${escapeHtml(title)}</td></tr>` +
    files.map((f) => `<tr><td width="52" valign="middle" style="padding:8px 0 10px 14px">` +
      `<div style="width:38px;height:38px;line-height:38px;border-radius:8px;text-align:center;font-size:11px;font-weight:700;color:#ffffff;background:${f.kind === "PDF" ? "#dc2626" : "#16a34a"}">${f.kind}</div></td>` +
      `<td valign="middle" style="padding:8px 14px 10px 4px"><div style="font-size:14px;font-weight:600;color:${INK};word-break:break-all">${escapeHtml(f.name)}</div>` +
      `<div style="font-size:12px;color:${MUTED}">${escapeHtml(f.note)}</div></td></tr>`).join("") +
    `</table>`;
}

/** A tinted box for something to keep in mind (security, a warning). The text is already escaped. */
export const mailNote = (html: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px"><tr><td style="padding:12px 14px;font-size:13px;line-height:1.5;color:#78350f">${html}</td></tr></table>`;

/** A code to type, big and spaced. */
export const mailCode = (code: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px"><tr><td style="background:${SOFT};border:1px solid ${LINE};border-radius:12px;padding:14px 22px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${INK}">${escapeHtml(code)}</td></tr></table>`;

/**
 * Every email the app sends: the brand on top (logo and name), a white card with the title and the content,
 * an optional button, and a small footer. `preheader` is the line mail apps show next to the subject.
 */
export function brandedHtml(o: { title: string; body: string; preheader?: string; button?: { label: string; url: string }; footer?: string; lang?: "es" | "en" }): string {
  const base = appBaseUrl();
  const btn = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 4px"><tr><td style="border-radius:10px;background:${ACCENT}"><a href="${escapeHtml(o.button.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(o.button.label)}</a></td></tr></table>`
    : "";
  return `<!doctype html><html lang="${o.lang ?? "es"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(o.title)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f1f5f9;font-family:${FONT}">` +
    (o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(o.preheader)}</div>` : "") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">` +
    // The brand
    `<tr><td style="padding:0 4px 14px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>` +
    `<td valign="middle" style="padding-right:10px"><img src="${escapeHtml(base)}/apple-touch-icon.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:9px"></td>` +
    `<td valign="middle" style="font-size:15px;font-weight:700;color:${INK}">Personal &amp; Business Solutions</td></tr></table></td></tr>` +
    // The card
    `<tr><td style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;padding:26px 22px">` +
    `<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:700;color:${INK}">${escapeHtml(o.title)}</h1>${o.body}${btn}</td></tr>` +
    // The footer
    `<tr><td style="padding:16px 8px 0;font-size:12px;line-height:1.5;color:${MUTED}">` +
    (o.footer ? `${o.footer}<br>` : "") +
    `Personal &amp; Business Solutions · <a href="${escapeHtml(base)}" style="color:${MUTED};text-decoration:underline">${escapeHtml(base.replace(/^https?:\/\//, ""))}</a></td></tr>` +
    `</table></td></tr></table></body></html>`;
}

/** A plain email: a title, paragraphs (already escaped) and an optional button, with the brand. */
export function simpleHtml(title: string, paragraphs: string[], button?: { label: string; url: string }, footer?: string): string {
  return brandedHtml({ title, body: paragraphs.map(mailP).join(""), button, footer });
}
