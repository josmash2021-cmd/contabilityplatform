import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { IRS_8879_SPOT, findSignSpot, sameName, signMoment, type PdfTextItem } from "@contracts/taxRules";
import { signatureId, signedPdf } from "./taxSign";
import { makeSealKey, sealIntact } from "./taxSeal";

const item = (str: string, x: number, y: number, width: number, size = 9): PdfTextItem => ({ str, transform: [size, 0, 0, size, x, y], width });

/** Part II of the IRS Form 8879 as pdf.js reads it (positions from the real form). */
const IRS_ITEMS: PdfTextItem[] = [
  item("Taxpayer’s PIN: check one box only", 36, 388, 153),
  item("Your signature", 35.9, 302.6, 58.7),
  item(" ", 94.6, 302.6, 0.3),
  item("▶", 97.2, 304.1, 7, 7),
  item(" ", 104.2, 304.1, 41.2, 7),
  item("Date", 392.6, 302.6, 18.8),
  item("▶", 414, 304.1, 7, 7),
  item("Spouse’s signature", 36, 183, 77),
  item("Date", 392.6, 183, 18.8),
];

/** Every text item on a page of a PDF, as the page reads them. */
async function textOf(bytes: Uint8Array, page: number): Promise<PdfTextItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pg = await doc.getPage(page);
  const tc = await pg.getTextContent();
  const out = tc.items.flatMap((it): PdfTextItem[] => ("str" in it ? [{ str: it.str, transform: it.transform, width: it.width }] : []));
  await doc.destroy();
  return out;
}

describe("the full name to sign", () => {
  it("must be every name and last name, in order", () => {
    expect(sameName("María López", "María José López")).toBe(false);
    expect(sameName("José López María", "María José López")).toBe(false);
    expect(sameName("María José López", "María José López")).toBe(true);
  });

  it("doesn't mind accents, capitals, extra spaces, dots or hyphens", () => {
    expect(sameName("  maria jose   LOPEZ ", "María José López")).toBe(true);
    expect(sameName("Ana Muñoz-Pérez", "ana munoz perez")).toBe(true);
    expect(sameName("Juan J. Ruiz", "Juan J Ruiz")).toBe(true);
    expect(sameName("", "")).toBe(false);
  });
});

describe("where the taxpayer signs the 8879", () => {
  it("finds the Your signature line and its Date box (not the spouse's)", () => {
    const s = findSignSpot([{ items: IRS_ITEMS, width: 612, height: 792 }]);
    expect(s.page).toBe(1);
    expect(s.y).toBeCloseTo(302.6, 1);
    expect(s.labelX).toBeCloseTo(35.9, 1);
    expect(s.x).toBeGreaterThan(104);
    expect(s.x).toBeLessThan(108);
    expect(s.x + s.w).toBeLessThan(392.6);
    expect(s.dateX).toBeGreaterThan(421);
    expect(s.dateX).toBeLessThan(426);
  });

  it("measures inside a line that comes in one piece", () => {
    const line = "Your signature  ___________________________   Date ________";
    const s = findSignSpot([{ items: [item(line, 56, 400, line.length * 5)], width: 612, height: 792 }]);
    expect(s.y).toBe(400);
    expect(s.x).toBeGreaterThan(56 + 14 * 5);
    expect(s.dateX).not.toBeNull();
    expect(s.dateX!).toBeGreaterThan(s.x + s.w);
  });

  it("looks on the next pages, and uses the IRS layout when there's no text (a scan)", () => {
    const later = findSignSpot([{ items: [], width: 612, height: 792 }, { items: IRS_ITEMS, width: 612, height: 792 }]);
    expect(later.page).toBe(2);
    expect(findSignSpot([{ items: [], width: 612, height: 792 }])).toEqual(IRS_8879_SPOT);
  });

  it("shows Alabama's date and time like the IRS form", () => {
    const m = signMoment(new Date("2026-11-23T04:39:00Z"));
    expect(m.date).toBe("11/22/2026");
    expect(m.time).toMatch(/^10:39\sPM CST$/);
  });
});

describe("the signed 8879", () => {
  it("has the signature on the line, the name, date and time beside it, the date in Date, and the signature page", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("Your signature", { x: 36, y: 302.6, size: 9, font });
    page.drawText("Date", { x: 392.6, y: 302.6, size: 9, font });
    const original = await pdf.save();
    const spot = findSignSpot([{ items: await textOf(original, 1), width: 612, height: 792 }]);
    // A tiny PNG signature (1x1, transparent) is enough to place.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const out = await signedPdf({ bytes: original, mimeType: "application/pdf" }, png, {
      name: "María José López", email: "eva@example.com", signedAt: new Date("2026-11-23T04:39:00Z"), ip: "1.2.3.4", userAgent: "test",
      docSha256: "abc", docName: "8879.pdf", taxYear: 2026, lang: "es", signId: "7F3A-91C2",
    }, spot);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(2);
    const text = await textOf(out, 1);
    const find = (s: string) => text.find((t) => t.str === s);
    const name = find("María José López");
    const when = find("11/22/2026 10:39 PM CST");
    const date = find("11/22/2026");
    expect(find("Electronically signed by")).toBeTruthy();
    const id = find("ID 7F3A-91C2");
    expect(id && Math.abs(id.transform[5] - (spot.y - 7)) < 0.5).toBe(true);
    expect(name && Math.abs(name.transform[5] - (spot.y + 8)) < 0.5 && name.transform[4] > spot.x && name.transform[4] < spot.x + spot.w).toBe(true);
    expect(when && Math.abs(when.transform[5] - (spot.y + 1)) < 0.5).toBe(true);
    expect(date && spot.dateX !== null && Math.abs(date.transform[4] - spot.dateX) < 0.5).toBe(true);
    const last = (await textOf(out, 2)).map((t) => t.str).join(" ");
    expect(last).toContain("Página 1, línea Your signature");
    expect(last).toContain("7F3A-91C2");
    expect(last).toContain("Firma dibujada en la pantalla");
  });

  it("keeps a spot from the page on the page", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const out = await signedPdf({ bytes: await pdf.save(), mimeType: "application/pdf" }, png, {
      name: "Eva Tax", email: null, signedAt: new Date(), ip: null, userAgent: null, docSha256: null, docName: null, taxYear: 2026, lang: "en", signId: "0000-0000",
    }, { page: 1, labelX: 0, x: 99_999, y: -500, w: 99_999, dateX: 99_999 });
    for (const t of await textOf(out, 1)) {
      expect(t.transform[4]).toBeLessThan(612);
      expect(t.transform[5]).toBeGreaterThan(0);
    }
  });
});

describe("the signature ID and the seal", () => {
  it("gives the same ID for the same signature (whole seconds), another one otherwise", () => {
    const png = Buffer.from("png-bytes");
    const at = new Date("2026-11-23T04:39:00.000Z");
    const id = signatureId("abc", at, png);
    expect(id).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(signatureId("abc", new Date("2026-11-23T04:39:00.731Z"), png)).toBe(id);
    expect(signatureId("abd", at, png)).not.toBe(id);
  });

  it("seals the signed 8879 so any change shows", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    page.drawText("Your signature", { x: 36, y: 302.6, size: 9, font: await pdf.embedFont(StandardFonts.Helvetica) });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const out = await signedPdf({ bytes: await pdf.save(), mimeType: "application/pdf" }, png, {
      name: "María José López", email: null, signedAt: new Date("2026-11-23T04:39:00Z"), ip: null, userAgent: null, docSha256: "abc",
      docName: null, taxYear: 2026, lang: "es", signId: "7F3A-91C2",
    }, { page: 1, labelX: 36, x: 106, y: 302.6, w: 278, dateX: 424 }, makeSealKey());
    expect(sealIntact(out)).toBe(true);
    expect(Buffer.from(out).toString("latin1")).toContain("/ByteRange");
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
    expect((await textOf(out, 2)).map((t) => t.str).join(" ")).toContain("Este PDF lleva un sello digital");
    // One byte changed in the content: the seal no longer matches.
    const bad = Buffer.from(out);
    bad[400] ^= 0x01;
    expect(sealIntact(bad)).toBe(false);
    expect(sealIntact(await pdf.save())).toBe(false);
  });
});
