// Photos and PDFs for the Asistente: checked and made ready to send (big phone photos are made smaller first).
// ── Photos and PDFs ──
export type Attachment = { name: string; mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf"; dataBase64: string };
export const MAX_FILES = 3;
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_PDF = 10 * 1024 * 1024;
const PHOTO_SIDE = 1600;

/** Why a file can't go: "type" (not a photo or a PDF) or "size" (too big even after making it smaller). */
export class FileProblem extends Error {
  readonly kind: "type" | "size";
  constructor(kind: "type" | "size") { super(kind); this.kind = kind; }
}

const asBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** A photo at most 1600 px on its longest side, as JPEG: a phone photo of 4–12 MB becomes a few hundred KB. */
async function smallerPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new FileProblem("type");
  ctx.fillStyle = "#ffffff"; // transparent PNGs get a white page, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const q of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= MAX_IMAGE) return blob;
  }
  throw new FileProblem("size");
}

/** A chosen file as it's sent to the assistant. */
export async function toAttachment(file: File): Promise<Attachment> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_PDF) throw new FileProblem("size");
    return { name: file.name, mime: "application/pdf", dataBase64: await asBase64(file) };
  }
  if (!file.type.startsWith("image/")) throw new FileProblem("type");
  let blob: Blob;
  try {
    blob = await smallerPhoto(file);
  } catch (e) {
    if (e instanceof FileProblem) throw e;
    throw new FileProblem("type"); // the browser couldn't open it (e.g. a HEIC it doesn't read)
  }
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { name, mime: "image/jpeg", dataBase64: await asBase64(blob) };
}
