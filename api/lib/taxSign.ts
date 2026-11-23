// Our own e-signature for the e-file authorization (Form 8879). The client draws the signature and types their
// name at "Revisa y firma" (Impuestos open with the emailed code). Kept: the signature (encrypted), name, time,
// IP, device and the SHA-256 of the 8879 they had in front of them. The signed copy is the 8879 the preparer
// uploaded with the signature on its "Your signature" line (the name, date and time beside it, the date in
// "Date"), plus one "Firma electrónica" page with all of that, so the preparer keeps it with the return.
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { STAMP, signMoment, stampHead, type SignSpot } from "@contracts/taxRules";

export type SignAudit = {
  name: string;
  email: string | null;
  signedAt: Date;
  ip: string | null;
  userAgent: string | null;
  docSha256: string | null;
  docName: string | null;
  taxYear: number;
  lang: "es" | "en";
};

export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** A drawn signature as sent by the page: a PNG data URL, not empty, not huge. */
export function decodeSignature(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const buf = Buffer.from(m[1], "base64");
  if (buf.length < 120 || buf.length > 300_000) return null;
  if (!PNG_HEAD.every((b, i) => buf[i] === b)) return null;
  return buf;
}

/** Text the standard PDF font can draw (it has the Spanish letters; anything else is simplified). */
function safe(font: PDFFont, s: string): string {
  try {
    font.encodeText(s);
    return s;
  } catch {
    return s.normalize("NFD").replace(/[^\x20-\x7E]/g, "");
  }
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/**
 * The signature on the 8879's "Your signature" line (the same box the page shows live), with "Firmado
 * electrónicamente por", the name, and the Alabama date and time beside it; the date also goes in "Date".
 * The spot comes from the page, so it is kept on the page. Returns the page it went on, or null.
 */
function stampSignature(pdf: PDFDocument, spot: SignSpot, sig: PDFImage, font: PDFFont, bold: PDFFont, a: SignAudit): number | null {
  const page = pdf.getPages()[spot.page - 1];
  if (!page) return null;
  const box = page.getMediaBox();
  const x = clamp(spot.x, box.x, box.x + box.width - 80);
  const y = clamp(spot.y, box.y + 10, box.y + box.height - 40);
  const w = clamp(spot.w, 60, box.x + box.width - x);
  const k = Math.min(STAMP.sigMaxW / sig.width, STAMP.sigH / sig.height);
  const sw = sig.width * k;
  page.drawImage(sig, { x: x + STAMP.sigLeft, y: y - STAMP.sigBelow, width: sw, height: sig.height * k });
  const tx = x + STAMP.sigLeft + sw + STAMP.gap;
  const room = Math.max(36, x + w - tx);
  const size = (f: PDFFont, s: string, max: number) => Math.min(max, room / Math.max(1, f.widthOfTextAtSize(s, 1)));
  const navy = rgb(0.09, 0.2, 0.55);
  const { date, time } = signMoment(a.signedAt);
  const head = safe(font, stampHead(a.lang));
  const name = safe(bold, a.name);
  const when = safe(font, `${date} ${time}`);
  page.drawText(head, { x: tx, y: y + 16, size: size(font, head, STAMP.headSize), font, color: navy });
  page.drawText(name, { x: tx, y: y + 8, size: size(bold, name, STAMP.nameSize), font: bold, color: navy });
  page.drawText(when, { x: tx, y: y + 1, size: size(font, when, STAMP.timeSize), font, color: navy });
  if (spot.dateX !== null) page.drawText(date, { x: clamp(spot.dateX, x, box.x + box.width - 50), y: y + 1, size: STAMP.dateSize, font, color: navy });
  return spot.page;
}

/**
 * The 8879 (PDF or photo) with the signature page added at the end; a PDF 8879 also gets the signature on its
 * line (`spot`). Without an 8879, just the signature page.
 */
export async function signedPdf(original: { bytes: Uint8Array; mimeType: string } | null, signaturePng: Uint8Array, a: SignAudit, spot: SignSpot | null = null): Promise<Uint8Array> {
  let pdf: PDFDocument;
  if (original?.mimeType === "application/pdf") {
    try { pdf = await PDFDocument.load(original.bytes, { ignoreEncryption: true }); } catch { pdf = await PDFDocument.create(); }
  } else {
    pdf = await PDFDocument.create();
    if (original && (original.mimeType === "image/png" || original.mimeType === "image/jpeg")) {
      const img = original.mimeType === "image/png" ? await pdf.embedPng(original.bytes) : await pdf.embedJpg(original.bytes);
      const page = pdf.addPage([612, 792]);
      const s = Math.min(552 / img.width, 732 / img.height, 1);
      page.drawImage(img, { x: (612 - img.width * s) / 2, y: (792 - img.height * s) / 2, width: img.width * s, height: img.height * s });
    }
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sig = await pdf.embedPng(signaturePng);
  const onPage = spot && original?.mimeType === "application/pdf" && pdf.getPageCount() > 0 ? stampSignature(pdf, spot, sig, font, bold, a) : null;
  const page = pdf.addPage([612, 792]);
  const es = a.lang === "es";
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.39, 0.45, 0.55);
  let y = 740;
  const text = (s: string, opts: { size?: number; b?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    const f = opts.b ? bold : font;
    page.drawText(safe(f, s), { x: 56, y, size: opts.size ?? 11, font: f, color: opts.color ?? ink });
    y -= (opts.size ?? 11) + 8;
  };
  text(es ? "Firma electrónica · Formulario 8879 (autorización de e-file)" : "Electronic signature · Form 8879 (e-file authorization)", { size: 16, b: true });
  text(es ? `Declaración de impuestos ${a.taxYear}` : `${a.taxYear} tax return`, { color: muted });
  y -= 6;
  const statement = es
    ? `Yo, ${a.name}, revisé mi declaración de impuestos ${a.taxYear} y los datos son correctos. Con esta firma electrónica firmo la autorización de e-file (Formulario 8879) y autorizo a mi preparador a presentarla por vía electrónica al IRS y al estado de Alabama.`
    : `I, ${a.name}, reviewed my ${a.taxYear} tax return and the information is correct. With this electronic signature I sign the e-file authorization (Form 8879) and authorize my preparer to file it electronically with the IRS and the State of Alabama.`;
  for (const l of wrap(font, safe(font, statement), 11, 500)) { page.drawText(l, { x: 56, y, size: 11, font, color: ink }); y -= 16; }
  y -= 10;
  // The signature, in a box
  page.drawRectangle({ x: 56, y: y - 110, width: 500, height: 110, borderColor: rgb(0.8, 0.84, 0.88), borderWidth: 1, color: rgb(0.99, 0.99, 1) });
  const s = Math.min(460 / sig.width, 90 / sig.height);
  page.drawImage(sig, { x: 56 + (500 - sig.width * s) / 2, y: y - 100 + (90 - sig.height * s) / 2, width: sig.width * s, height: sig.height * s });
  y -= 128;
  text(safe(bold, a.name), { b: true, size: 12 });
  y -= 6;
  const when = a.signedAt.toLocaleString(es ? "es-US" : "en-US", { timeZone: "America/Chicago", dateStyle: "long", timeStyle: "medium" });
  const rows: Array<[string, string]> = [
    [es ? "Fecha y hora (Alabama)" : "Date and time (Alabama)", when],
    [es ? "Fecha y hora (UTC)" : "Date and time (UTC)", a.signedAt.toISOString()],
    [es ? "Correo de la cuenta" : "Account email", a.email ?? "—"],
    [es ? "Identidad verificada con" : "Identity checked with", es ? "Código de 6 números enviado a su correo para abrir Impuestos" : "6-digit code sent to their email to open Taxes"],
    [es ? "Dirección IP" : "IP address", a.ip ?? "—"],
    [es ? "Dispositivo" : "Device", (a.userAgent ?? "—").slice(0, 300)],
    [es ? "Documento firmado" : "Signed document", a.docName ?? (es ? "Formulario 8879" : "Form 8879")],
    ...(onPage ? [[es ? "Firma en el 8879" : "Signature on the 8879", es ? `Página ${onPage}, línea Your signature` : `Page ${onPage}, Your signature line`] as [string, string]] : []),
    ["SHA-256", a.docSha256 ?? "—"],
  ];
  for (const [k, v] of rows) {
    page.drawText(safe(font, k), { x: 56, y, size: 9.5, font, color: muted });
    const lines = wrap(font, safe(font, v), 9.5, 330);
    lines.forEach((l, i) => page.drawText(l, { x: 226, y: y - i * 13, size: 9.5, font: k === "SHA-256" ? font : bold, color: ink }));
    y -= 13 * Math.max(1, lines.length) + 6;
  }
  y -= 8;
  for (const l of wrap(font, safe(font, es
    ? "Esta hoja forma parte de la autorización de e-file. Personal & Business Solutions guarda la firma cifrada junto con este registro."
    : "This page is part of the e-file authorization. Personal & Business Solutions keeps the signature encrypted together with this record."), 9, 500)) {
    page.drawText(l, { x: 56, y, size: 9, font, color: muted }); y -= 12;
  }
  return pdf.save();
}
