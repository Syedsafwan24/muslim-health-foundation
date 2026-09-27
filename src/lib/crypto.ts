import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Government ID numbers: AES-256-GCM at rest. Only the last 4 are ever rendered.
function key(): Buffer {
  const k = Buffer.from(process.env.ID_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("ID_ENCRYPTION_KEY must be 32 bytes, base64");
  return k;
}

export function encryptId(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptId(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export const normaliseName = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
export const normaliseMobile = (s: string) => s.replace(/\D/g, "").slice(-10);

/** sha256(normalised mobile + normalised name), for duplicate detection. */
export function identityHash(fullName: string, mobile?: string | null): string {
  return createHash("sha256").update(`${normaliseMobile(mobile ?? "")}|${normaliseName(fullName)}`).digest("hex");
}

export const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
