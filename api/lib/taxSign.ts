// Our own e-signature for the e-file authorization (Form 8879). The client draws the signature and types their
// name at "Revisa y firma" (Impuestos open with the emailed code). Kept: the signature (encrypted), name, time,
// IP, device and the SHA-256 of the 8879 they had in front of them. The signed copy is the 8879 the preparer
// uploaded with the signature on its "Your signature" line (the name, date and time beside it, the date in
// "Date"), plus one "Firma electrónica" page with all of that, so the preparer keeps it with the return.
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from "pdf-lib";
import { STAMP, STAMP_HEAD, signMoment, stampId, type SignSpot } from "@contracts/taxRules";
import { sealPdf, type SealKey } from "./taxSeal";

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
  /** signatureId(): beside the signature and on the signature page. */
  signId: string;
  /** The in-person ID check (IRS Pub. 1345): which photo ID the preparer inspected, who, when; null = not recorded. */
  identity?: { idType: string; taxIdKind: string; taxIdLast4: string; checkedBy: string | null; checkedAt: Date } | null;
};

const ID_NAMES: Record<string, [string, string]> = {
  license: ["licencia de manejar", "driver's license"],
  state_id: ["identificación del estado", "state ID"],
  passport: ["pasaporte", "passport"],
  consular: ["matrícula consular o identificación nacional", "consular or national ID"],
  military: ["identificación militar", "military ID"],
  other: ["otra identificación oficial con foto", "other government photo ID"],
};

/** "Identidad verificada con": the in-person ID check in words. */
function identityText(a: SignAudit): string {
  const es = a.lang === "es";
  const i = a.identity;
  if (!i) return es ? "Sin registro de verificación" : "No verification recorded";
  const idName = (ID_NAMES[i.idType] ?? ID_NAMES.other)[es ? 0 : 1];
  const when = i.checkedAt.toLocaleString(es ? "es-US" : "en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
  const tin = `${i.taxIdKind === "itin" ? "ITIN" : "SSN"} ***-**-${i.taxIdLast4}`;
  return es
    ? `En persona: ${i.checkedBy ?? "su preparador"} revisó su ${idName}, comparó la foto y anotó nombre, ${tin}, dirección y fecha de nacimiento (${when}). Firmó con su preparador presente.`
    : `In person: ${i.checkedBy ?? "their preparer"} inspected their ${idName}, compared the photo and recorded name, ${tin}, address and date of birth (${when}). Signed with the preparer present.`;
}

export const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/**
 * The signature's short ID ("7F3A-91C2"), printed beside the signature and on the signature page. It can be
 * worked out again from what taxSignatures keeps: SHA-256 of "<8879 SHA-256>|<signedAt, whole seconds, ISO>|<signature PNG SHA-256>".
 */
export function signatureId(docSha256: string | null, signedAt: Date, png: Uint8Array): string {
  const h = sha256(Buffer.from(`${docSha256 ?? ""}|${new Date(Math.floor(signedAt.getTime() / 1000) * 1000).toISOString()}|${sha256(png)}`)).slice(0, 8).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4)}`;
}

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
  const head = safe(font, STAMP_HEAD);
  const name = safe(bold, a.name);
  const when = safe(font, `${date} ${time}`);
  const id = stampId(a.signId);
  page.drawText(head, { x: tx, y: y + 16, size: size(font, head, STAMP.headSize), font, color: navy });
  page.drawText(name, { x: tx, y: y + 8, size: size(bold, name, STAMP.nameSize), font: bold, color: navy });
  page.drawText(when, { x: tx, y: y + 1, size: size(font, when, STAMP.timeSize), font, color: navy });
  // Under the line: the ID that ties this signature to the signature page.
  page.drawText(id, { x: tx, y: y - 7, size: STAMP.idSize, font, color: navy });
  if (spot.dateX !== null) page.drawText(date, { x: clamp(spot.dateX, x, box.x + box.width - 50), y: y + 1, size: STAMP.dateSize, font, color: navy });
  return spot.page;
}

/**
 * The 8879 (PDF or photo) with the signature page added at the end; a PDF 8879 also gets the signature on its
 * line (`spot`). Without an 8879, just the signature page. With a seal key, the whole file is sealed last
 * (taxSeal); if sealing fails the file goes unsealed rather than blocking the signature.
 */
export async function signedPdf(original: { bytes: Uint8Array; mimeType: string } | null, signaturePng: Uint8Array, a: SignAudit, spot: SignSpot | null = null, seal: SealKey | null = null): Promise<Uint8Array> {
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
    [es ? "Identidad verificada" : "Identity verified", identityText(a)],
    [es ? "Acceso a la cuenta" : "Account access", es ? "Sesión de su cuenta y código de 6 números enviado a su correo para abrir Impuestos" : "Their account session and a 6-digit code sent to their email to open Taxes"],
    [es ? "Dirección IP" : "IP address", a.ip ?? "—"],
    [es ? "Dispositivo" : "Device", (a.userAgent ?? "—").slice(0, 300)],
    [es ? "ID de la firma" : "Signature ID", a.signId],
    [es ? "Método de firma" : "Signature method", es ? "Firma dibujada en la pantalla (dedo o mouse) y nombre completo escrito, que coincide con el de la declaración" : "Signature drawn on the screen (finger or mouse) and full name typed, matching the name on the return"],
    [es ? "Documento firmado" : "Signed document", a.docName ?? (es ? "Formulario 8879" : "Form 8879")],
    ...(onPage ? [[es ? "Firma en el 8879" : "Signature on the 8879", es ? `Página ${onPage}, línea Your signature` : `Page ${onPage}, Your signature line`] as [string, string]] : []),
    [es ? "SHA-256 del 8879 que vio" : "SHA-256 of the 8879 they saw", a.docSha256 ?? "—"],
    ...(seal ? [[es ? "Sello del documento" : "Document seal", es
      ? "Este PDF lleva un sello digital de Personal & Business Solutions. Si alguien lo cambia, el lector de PDF (por ejemplo Adobe Acrobat) avisa que fue modificado."
      : "This PDF carries a digital seal from Personal & Business Solutions. If anyone changes it, a PDF reader (such as Adobe Acrobat) shows it was modified."] as [string, string]] : []),
  ];
  for (const [k, v] of rows) {
    page.drawText(safe(font, k), { x: 56, y, size: 9.5, font, color: muted });
    const lines = wrap(font, safe(font, v), 9.5, 330);
    lines.forEach((l, i) => page.drawText(l, { x: 226, y: y - i * 13, size: 9.5, font: k.startsWith("SHA-256") ? font : bold, color: ink }));
    y -= 13 * Math.max(1, lines.length) + 6;
  }
  y -= 8;
  for (const l of wrap(font, safe(font, es
    ? "Esta hoja forma parte de la autorización de e-file. Personal & Business Solutions guarda la firma cifrada junto con este registro."
    : "This page is part of the e-file authorization. Personal & Business Solutions keeps the signature encrypted together with this record."), 9, 500)) {
    page.drawText(l, { x: 56, y, size: 9, font, color: muted }); y -= 12;
  }
  if (!seal) return pdf.save();
  const plain = await pdf.save();
  try {
    return await sealPdf(pdf, seal, a.signedAt, es ? "Firma electrónica del Formulario 8879" : "Form 8879 electronic signature");
  } catch (e) {
    console.error("[taxSign] seal failed, keeping the unsealed copy:", e instanceof Error ? e.message : e);
    return plain;
  }
}
