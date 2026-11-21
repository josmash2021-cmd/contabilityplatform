// A small PDF writer with no dependency: letter pages drawn with Helvetica / Helvetica-Bold (the
// PDF standard fonts, WinAnsi encoding, so Spanish accents work), text, lines and boxes. The page
// layout is a list of drawing operations; the same list draws the on-screen preview (PdfPreview.tsx),
// so what you see is exactly what you download. Pure: runs in the browser and in Node (tests).

export type Rgb = readonly [number, number, number];
export type TextOp = { k: "text"; x: number; y: number; s: string; size: number; bold?: boolean; color: Rgb; align?: "left" | "right" | "center" };
export type RectOp = { k: "rect"; x: number; y: number; w: number; h: number; r?: number; fill?: Rgb; stroke?: Rgb; lw?: number };
export type LineOp = { k: "line"; x1: number; y1: number; x2: number; y2: number; color: Rgb; lw: number };
export type Op = TextOp | RectOp | LineOp;
/** One page: operations in top-left coordinates (points, y grows down), like the screen. */
export type Page = Op[];

export const PAGE_W = 612;
export const PAGE_H = 792;

// ── Font metrics (Adobe's AFM widths, 1/1000 em) for the WinAnsi characters we print ──
const ASCII_REG = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const ASCII_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
// Latin-1 letters by the letter they're built on (accents don't change the width).
const LATIN1_BASE: Record<string, string> = {
  "À": "A", "Á": "A", "Â": "A", "Ã": "A", "Ä": "A", "Å": "A", "Ç": "C", "È": "E", "É": "E", "Ê": "E", "Ë": "E", "Ì": "I", "Í": "I", "Î": "I", "Ï": "I",
  "Ñ": "N", "Ò": "O", "Ó": "O", "Ô": "O", "Õ": "O", "Ö": "O", "Ø": "O", "Ù": "U", "Ú": "U", "Û": "U", "Ü": "U", "Ý": "Y",
  "à": "a", "á": "a", "â": "a", "ã": "a", "ä": "a", "å": "a", "ç": "c", "è": "e", "é": "e", "ê": "e", "ë": "e", "ì": "i", "í": "i", "î": "i", "ï": "i",
  "ñ": "n", "ò": "o", "ó": "o", "ô": "o", "õ": "o", "ö": "o", "ø": "o", "ù": "u", "ú": "u", "û": "u", "ü": "u", "ý": "y", "ÿ": "y",
};
const SPECIAL: Record<string, [number, number]> = {
  "¿": [611, 611], "¡": [333, 333], "·": [278, 278], "°": [400, 400], "–": [556, 556], "—": [1000, 1000], "•": [350, 350], "…": [1000, 1000],
  "‘": [222, 278], "’": [222, 278], "“": [333, 500], "”": [333, 500], "€": [556, 556], "×": [584, 584], "«": [556, 556], "»": [556, 556],
  "ß": [611, 611], "Æ": [1000, 1000], "æ": [889, 889], " ": [278, 278], "§": [556, 556], "©": [737, 737], "®": [737, 737], "º": [365, 365], "ª": [370, 370],
};
// Unicode → WinAnsi byte for the characters outside Latin-1.
const WINANSI_EXTRA: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e,
  "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/** Characters the standard fonts can't print, written the closest way they can. */
export function printable(s: string): string {
  return s
    .replace(/\u2212/g, "-") // real minus → hyphen
    .replace(/\u2191/g, "+").replace(/\u2193/g, "-") // ↑ ↓
    .replace(/[\u2009\u202f\u2007]/g, " "); // thin and narrow spaces
}

function charWidth(ch: string, bold: boolean): number {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return (bold ? ASCII_BOLD : ASCII_REG)[c - 32];
  const sp = SPECIAL[ch];
  if (sp) return sp[bold ? 1 : 0];
  const base = LATIN1_BASE[ch];
  if (base) return charWidth(base, bold);
  return bold ? 611 : 556;
}

/** Width of a text in points at this size. */
export function measure(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of printable(s)) w += charWidth(ch, bold);
  return (w * size) / 1000;
}

/** The text cut to fit `max` points, ending in "…" when it had to be cut. */
export function fit(s: string, max: number, size: number, bold = false): string {
  if (measure(s, size, bold) <= max) return s;
  const chars = [...s];
  while (chars.length > 0 && measure(chars.join("") + "…", size, bold) > max) chars.pop();
  return chars.join("").trimEnd() + "…";
}

/** Left edge of a text op (right and center aligned texts are measured). */
export function textLeft(op: TextOp): number {
  if (!op.align || op.align === "left") return op.x;
  const w = measure(op.s, op.size, op.bold);
  return op.align === "right" ? op.x - w : op.x - w / 2;
}

// ── Writing the file ──
const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};
const rgb = (c: Rgb) => `${n(c[0] / 255)} ${n(c[1] / 255)} ${n(c[2] / 255)}`;

/** A PDF string literal in WinAnsi, kept ASCII-only (other bytes as octal escapes). */
function pdfString(s: string): string {
  let out = "(";
  for (const ch of printable(s)) {
    const c = ch.charCodeAt(0);
    let b: number;
    if (c < 128) b = c;
    else if (c >= 0xa0 && c <= 0xff) b = c;
    else b = WINANSI_EXTRA[ch] ?? 63; // "?"
    if (b === 40 || b === 41 || b === 92) out += "\\" + String.fromCharCode(b);
    else if (b < 32 || b > 126) out += "\\" + b.toString(8).padStart(3, "0");
    else out += String.fromCharCode(b);
  }
  return out + ")";
}

/** A document-info string (title, author) as UTF-16 so any letter survives. */
function infoString(s: string): string {
  let hex = "FEFF";
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

function roundedPath(x: number, y: number, w: number, h: number, r: number): string {
  // PDF coordinates: (x, y) is the bottom-left corner.
  const k = 0.5523 * r;
  return [
    `${n(x + r)} ${n(y)} m`,
    `${n(x + w - r)} ${n(y)} l`, `${n(x + w - r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)} c`,
    `${n(x + w)} ${n(y + h - r)} l`, `${n(x + w)} ${n(y + h - r + k)} ${n(x + w - r + k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c`,
    `${n(x + r)} ${n(y + h)} l`, `${n(x + r - k)} ${n(y + h)} ${n(x)} ${n(y + h - r + k)} ${n(x)} ${n(y + h - r)} c`,
    `${n(x)} ${n(y + r)} l`, `${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c`,
    "h",
  ].join("\n");
}

function contentOf(page: Page): string {
  const out: string[] = [];
  for (const op of page) {
    if (op.k === "text") {
      const x = textLeft(op);
      out.push(`BT /${op.bold ? "F2" : "F1"} ${n(op.size)} Tf ${rgb(op.color)} rg ${n(x)} ${n(PAGE_H - op.y)} Td ${pdfString(op.s)} Tj ET`);
    } else if (op.k === "line") {
      out.push(`${n(op.lw)} w ${rgb(op.color)} RG ${n(op.x1)} ${n(PAGE_H - op.y1)} m ${n(op.x2)} ${n(PAGE_H - op.y2)} l S`);
    } else {
      const y = PAGE_H - op.y - op.h;
      const path = op.r ? roundedPath(op.x, y, op.w, op.h, Math.min(op.r, op.w / 2, op.h / 2)) : `${n(op.x)} ${n(y)} ${n(op.w)} ${n(op.h)} re`;
      if (op.fill && op.stroke) out.push(`${rgb(op.fill)} rg ${rgb(op.stroke)} RG ${n(op.lw ?? 0.75)} w ${path} B`);
      else if (op.fill) out.push(`${rgb(op.fill)} rg ${path} f`);
      else if (op.stroke) out.push(`${rgb(op.stroke)} RG ${n(op.lw ?? 0.75)} w ${path} S`);
    }
  }
  return out.join("\n");
}

const pdfDate = (d: Date) => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};

/** The finished PDF file. Everything in it is ASCII, so string length = byte length. */
export function renderPdf(pages: readonly Page[], info: { title: string; author: string; creator: string; created: Date }): Uint8Array {
  const objs: string[] = [];
  // 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info, then page + content pairs.
  const kids = pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objs.push(`<< /Title ${infoString(info.title)} /Author ${infoString(info.author)} /Creator ${infoString(info.creator)} /Producer (Personal & Business Solutions) /CreationDate (${pdfDate(info.created)}) >>`);
  pages.forEach((page, i) => {
    const content = contentOf(page);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  // The second line marks the file as binary: 4 bytes over 127, written as single bytes below.
  let out = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
