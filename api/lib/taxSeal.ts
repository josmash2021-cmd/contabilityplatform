// The digital seal on the signed 8879 (IRS Pub. 1345 asks for a tamper-proof record): a PDF signature
// (PKCS#7, SHA-256) over the whole file, so any later change shows in a PDF reader as "modified after it was
// signed". The seal's key is the app's own (an RSA key and a self-signed certificate for "Personal & Business
// Solutions"), made the first time and kept in the database encrypted with TAX_FILES_KEY. A reader such as
// Acrobat confirms the file wasn't changed; it calls the signer "unknown" until a CA certificate replaces it.
import { generateKeyPairSync, randomBytes, createHash } from "node:crypto";
import forge from "node-forge";
import { sql } from "drizzle-orm";
import type { PDFDocument } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { decryptTaxFile, encryptTaxFile } from "./taxCrypto";

export type SealKey = { p12: Buffer; passphrase: string };
const ORG = "Personal & Business Solutions";

/** A new seal key: RSA 2048 and a self-signed certificate valid for 20 years, as a P12 with a random passphrase. */
export function makeSealKey(): SealKey {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  const key = forge.pki.privateKeyFromPem(privateKey);
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(publicKey);
  cert.serialNumber = "01" + randomBytes(15).toString("hex");
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 20 * 365 * 24 * 3600_000);
  const who = [
    { name: "commonName", value: `${ORG} - e-signature seal` },
    { name: "organizationName", value: ORG },
    { shortName: "ST", value: "Alabama" },
    { name: "countryName", value: "US" },
  ];
  cert.setSubject(who);
  cert.setIssuer(who);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(key, forge.md.sha256.create());
  const passphrase = randomBytes(24).toString("base64url");
  const p12 = forge.pkcs12.toPkcs12Asn1(key, [cert], passphrase, { algorithm: "aes256" });
  return { p12: Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary"), passphrase };
}

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
let cached: Promise<SealKey> | null = null;

/** The app's seal key: read from taxSealKeys (one row), made and stored the first time (one wins a race). */
export function sealKey(db: Db): Promise<SealKey> {
  cached ??= (async () => {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS taxSealKeys (
      id INT PRIMARY KEY, data LONGBLOB NOT NULL, createdAt TIMESTAMP DEFAULT NOW() NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const read = async () => {
      const res = (await db.execute(sql`SELECT data FROM taxSealKeys WHERE id = 1`)) as unknown as [Array<{ data: Buffer }>] | Array<{ data: Buffer }>;
      const rows = (Array.isArray(res[0]) ? res[0] : res) as Array<{ data: Buffer }>;
      return rows[0]?.data ?? null;
    };
    let stored = await read();
    if (!stored) {
      const k = makeSealKey();
      const blob = encryptTaxFile(Buffer.from(JSON.stringify({ p12: k.p12.toString("base64"), passphrase: k.passphrase })));
      await db.execute(sql`INSERT IGNORE INTO taxSealKeys (id, data) VALUES (1, ${blob})`);
      stored = await read();
    }
    if (!stored) throw new Error("seal key missing");
    const j = JSON.parse(decryptTaxFile(Buffer.from(stored)).toString("utf8")) as { p12: string; passphrase: string };
    return { p12: Buffer.from(j.p12, "base64"), passphrase: j.passphrase };
  })().catch((e) => { cached = null; throw e; });
  return cached;
}

/** Seals a pdf-lib document (adds the signature field, saves, signs). Nothing may change the file after this. */
export async function sealPdf(pdf: PDFDocument, key: SealKey, signedAt: Date, reason: string): Promise<Uint8Array> {
  pdflibAddPlaceholder({ pdfDoc: pdf, reason, contactInfo: "", name: ORG, location: "Alabama, US", signingTime: signedAt, signatureLength: 8192, appName: ORG });
  const bytes = await pdf.save({ useObjectStreams: false });
  return new SignPdf().sign(Buffer.from(bytes), new P12Signer(key.p12, { passphrase: key.passphrase }), signedAt);
}

/**
 * Checks a sealed PDF: the seal covers the whole file but its own slot, the digest inside the seal is the file's,
 * and the certificate's key signed it. `false` if anything was changed (or there's no seal).
 */
export function sealIntact(pdf: Uint8Array): boolean {
  try {
    const buf = Buffer.from(pdf);
    const text = buf.toString("latin1");
    const all = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)];
    const m = all[all.length - 1];
    if (!m) return false;
    const [a, b, c, d] = m.slice(1).map(Number);
    if (a !== 0 || c + d !== buf.length) return false;
    const signed = Buffer.concat([buf.subarray(a, a + b), buf.subarray(c, c + d)]);
    const hex = text.slice(a + b + 1, c - 1).replace(/(00)+$/, "");
    // The slot is padded with zeros after the seal: parse the seal and ignore the rest (node-forge takes an
    // options object here; its types only list the old boolean).
    const der = forge.asn1.fromDer(forge.util.hexToBytes(hex), { parseAllBytes: false } as unknown as boolean);
    const p7 = forge.pkcs7.messageFromAsn1(der) as forge.pkcs7.PkcsSignedData & {
      rawCapture: { authenticatedAttributes: forge.asn1.Asn1[]; signature: string };
    };
    const attrs = p7.rawCapture.authenticatedAttributes;
    const digestAttr = attrs.find((attr) => forge.asn1.derToOid((attr.value as forge.asn1.Asn1[])[0].value as string) === forge.pki.oids.messageDigest);
    const inSeal = ((digestAttr?.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[])[0].value as string;
    if (Buffer.from(inSeal, "binary").toString("hex") !== createHash("sha256").update(signed).digest("hex")) return false;
    const set = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, attrs);
    const md = forge.md.sha256.create().update(forge.asn1.toDer(set).getBytes());
    const certKey = p7.certificates[0].publicKey as forge.pki.rsa.PublicKey;
    return certKey.verify(md.digest().bytes(), p7.rawCapture.signature);
  } catch {
    return false;
  }
}
