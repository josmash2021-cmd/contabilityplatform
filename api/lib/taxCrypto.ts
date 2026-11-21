import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Tax documents (IDs, Social Security cards, W-2s) are stored in the database,
// encrypted with AES-256-GCM. The key lives only in the server's environment
// (TAX_FILES_KEY, 32 random bytes in base64), never in the database, so a copy of
// the database alone can't open the files.
//
// Stored layout: [1 byte version][12 bytes IV][16 bytes auth tag][ciphertext]

const VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

export class TaxKeyMissingError extends Error {
  constructor() {
    super("TAX_FILES_KEY is not set: tax documents can't be stored or opened");
  }
}

function readKey(raw: string | undefined): Buffer {
  if (!raw) throw new TaxKeyMissingError();
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TAX_FILES_KEY must be 32 bytes in base64");
  return key;
}

export function encryptTaxFile(plain: Buffer, rawKey: string | undefined = process.env.TAX_FILES_KEY): Buffer {
  const key = readKey(rawKey);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
}

export function decryptTaxFile(stored: Buffer, rawKey: string | undefined = process.env.TAX_FILES_KEY): Buffer {
  const key = readKey(rawKey);
  if (stored.length < 1 + IV_LEN + TAG_LEN || stored[0] !== VERSION) throw new Error("Unknown tax file format");
  const iv = stored.subarray(1, 1 + IV_LEN);
  const tag = stored.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(stored.subarray(1 + IV_LEN + TAG_LEN)), decipher.final()]);
}

export function hasTaxKey(): boolean {
  try {
    readKey(process.env.TAX_FILES_KEY);
    return true;
  } catch {
    return false;
  }
}
