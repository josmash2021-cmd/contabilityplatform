// Turning a picked file into what the tax upload endpoints take, and back into
// something the browser can show. Shared by the client's Impuestos page and the
// preparer's admin pages.

export const TAX_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;
export type TaxFileType = (typeof TAX_FILE_TYPES)[number];
export const TAX_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** For <input type="file" accept=…>: photos (camera or gallery) and PDFs. */
export const TAX_ACCEPT = "image/*,application/pdf";

export type TaxUpload = { fileName: string; mimeType: TaxFileType; dataBase64: string };

export class TaxFileError extends Error {
  reason: "type" | "tooBig";
  constructor(reason: "type" | "tooBig") {
    super(reason);
    this.reason = reason;
  }
}

function typeOf(file: File): TaxFileType | null {
  const t = file.type.toLowerCase();
  if ((TAX_FILE_TYPES as readonly string[]).includes(t)) return t as TaxFileType;
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return null;
}

/** Big phone photos are shrunk to 2400 px (JPEG) so they upload fast; documents stay readable. */
async function shrinkPhoto(file: File): Promise<Blob | null> {
  if (file.size < 1.5 * 1024 * 1024) return null;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : null;
  } catch {
    return null; // e.g. HEIC in a browser that can't read it: upload the original
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function prepareTaxUpload(file: File): Promise<TaxUpload> {
  let mimeType = typeOf(file);
  if (!mimeType) throw new TaxFileError("type");
  let blob: Blob = file;
  let fileName = file.name || "documento";
  if (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp") {
    const small = await shrinkPhoto(file);
    if (small) {
      blob = small;
      mimeType = "image/jpeg";
      fileName = fileName.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg";
    }
  }
  if (blob.size > TAX_MAX_FILE_BYTES) throw new TaxFileError("tooBig");
  return { fileName, mimeType, dataBase64: await toBase64(blob) };
}

export function base64ToBlobUrl(dataBase64: string, mimeType: string): string {
  const bin = atob(dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export function formatFileSize(n: number): string {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** April 15 of the year after the tax year, e.g. "15 abr 2027". */
export function taxDeadline(taxYear: number, locale: string): string {
  return new Date(taxYear + 1, 3, 15).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}
