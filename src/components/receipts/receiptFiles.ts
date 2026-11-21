// Browser helpers for Recibos: the small preview made before uploading, and opening
// a decrypted file in a new tab or saving it. The upload itself reuses prepareTaxUpload
// (src/lib/taxFiles.ts): same types, same 10 MB limit, big phone photos shrunk.
import { base64ToBlobUrl } from "@/lib/taxFiles";
import { RECEIPT_THUMB_MAX_BYTES } from "../../../api/lib/receipts";

const THUMB_SIZE = 320;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * A small JPEG (about 320 px) for the receipts list, so it never downloads full photos.
 * Null for PDFs and for photos this browser can't read (e.g. HEIC outside Safari): the list shows an icon.
 */
export async function makeReceiptThumb(file: File, mimeType: string): Promise<string | null> {
  if (!mimeType.startsWith("image/")) return null;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, THUMB_SIZE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    const g = canvas.getContext("2d");
    if (!g) {
      bmp.close();
      return null;
    }
    g.fillStyle = "#ffffff"; // transparent PNGs get a white background in the JPEG
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.72));
    if (!blob || blob.size > RECEIPT_THUMB_MAX_BYTES) return null;
    return await blobToBase64(blob);
  } catch {
    return null;
  }
}

/** Opens the file in a new tab (full size photo, or the PDF in the browser's viewer). */
export function openFileInNewTab(dataBase64: string, mimeType: string): void {
  const url = base64ToBlobUrl(dataBase64, mimeType);
  window.open(url, "_blank", "noopener");
  // The new tab has its own copy once loaded.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Saves the file to the device. */
export function downloadFile(dataBase64: string, mimeType: string, fileName: string): void {
  const url = base64ToBlobUrl(dataBase64, mimeType);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "2026-11-21" -> local date for display, without time zone shifts. */
export function formatIsoDate(iso: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(locale, options);
}
