import { describe, expect, it } from "vitest";
import { LOGO_MAX_BYTES, LOGO_TYPES, checkLogo, parseLogoDataUrl, sniffLogo } from "../settings-router";
import * as client from "../../src/components/settings/logoRules";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x1a, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(8)]);

describe("logo checks (server)", () => {
  it("knows real PNG, JPEG and WEBP bytes", () => {
    expect(sniffLogo(PNG, "image/png")).toBe(true);
    expect(sniffLogo(JPEG, "image/jpeg")).toBe(true);
    expect(sniffLogo(WEBP, "image/webp")).toBe(true);
    expect(sniffLogo(JPEG, "image/png")).toBe(false);
    expect(sniffLogo(PNG, "image/jpeg")).toBe(false);
    expect(sniffLogo(Buffer.from("<svg/>"), "image/svg+xml")).toBe(false);
  });

  it("accepts a good image and refuses wrong types, empty and too big", () => {
    expect(checkLogo("image/png", PNG.toString("base64"))).toMatchObject({ ok: true, mimeType: "image/png" });
    expect(checkLogo("image/gif", PNG.toString("base64"))).toEqual({ ok: false, reason: "type" });
    expect(checkLogo("image/svg+xml", Buffer.from("<svg/>").toString("base64"))).toEqual({ ok: false, reason: "type" });
    expect(checkLogo("image/png", "")).toEqual({ ok: false, reason: "empty" });
    expect(checkLogo("image/png", Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]).toString("base64"))).toEqual({ ok: false, reason: "tooBig" });
    expect(checkLogo("image/png", JPEG.toString("base64"))).toEqual({ ok: false, reason: "type" });
  });

  it("reads only image data URLs of the allowed types", () => {
    expect(parseLogoDataUrl(`data:image/png;base64,${PNG.toString("base64")}`)).toEqual({ mimeType: "image/png", dataBase64: PNG.toString("base64") });
    expect(parseLogoDataUrl("data:image/svg+xml;base64,PHN2Zy8+")).toBeNull();
    expect(parseLogoDataUrl("https://example.com/logo.png")).toBeNull();
    expect(parseLogoDataUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("logo checks (page)", () => {
  it("uses the server's limit and types", () => {
    expect(client.LOGO_MAX_BYTES).toBe(LOGO_MAX_BYTES);
    expect([...client.LOGO_TYPES]).toEqual([...LOGO_TYPES]);
    expect(client.isLogoType("image/png")).toBe(true);
    expect(client.isLogoType("image/svg+xml")).toBe(false);
  });

  it("shrinks inside a square, keeping the shape and never growing", () => {
    expect(client.fitInside(2000, 1000, 800)).toEqual({ width: 800, height: 400 });
    expect(client.fitInside(500, 1500, 800)).toEqual({ width: 267, height: 800 });
    expect(client.fitInside(300, 200, 800)).toEqual({ width: 300, height: 200 });
    expect(client.fitInside(0, 10, 800)).toEqual({ width: 0, height: 0 });
  });
});
