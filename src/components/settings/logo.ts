// Getting a logo ready to upload: the same limits the server checks (./logoRules), and a big photo
// shrunk in the browser so it fits.

import { LOGO_MAX_BYTES, LOGO_MAX_SIDE, LogoPrepError, fitInside, isLogoType } from "./logoRules";

export { LOGO_MAX_BYTES, LOGO_TYPES, LogoPrepError } from "./logoRules";

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new LogoPrepError("read"));
    r.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new LogoPrepError("read"));
    img.src = src;
  });
}

async function shrink(img: HTMLImageElement, type: string, side: number): Promise<Blob | null> {
  const { width, height } = fitInside(img.naturalWidth, img.naturalHeight, side);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  if (!g) return null;
  g.drawImage(img, 0, 0, width, height);
  // PNG keeps a transparent background; photos go out as JPEG/WEBP.
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, 0.9));
}

/** The file as { mimeType, dataBase64 } for settings.uploadLogo; shrinks it first if it's too heavy. */
export async function prepareLogo(file: File): Promise<{ mimeType: string; dataBase64: string }> {
  if (!isLogoType(file.type)) throw new LogoPrepError("type");
  let blob: Blob = file;
  if (file.size > LOGO_MAX_BYTES) {
    const img = await loadImage(await readAsDataUrl(file));
    for (const side of [LOGO_MAX_SIDE, 512, 320]) {
      const out = await shrink(img, file.type, side);
      // A browser that can't write WEBP gives PNG back: that's fine too.
      if (out && isLogoType(out.type) && out.size <= LOGO_MAX_BYTES) { blob = out; break; }
    }
    if (blob.size > LOGO_MAX_BYTES) throw new LogoPrepError("tooBig");
  }
  const url = await readAsDataUrl(blob);
  const comma = url.indexOf(",");
  if (comma < 0) throw new LogoPrepError("read");
  return { mimeType: blob.type || file.type, dataBase64: url.slice(comma + 1) };
}
