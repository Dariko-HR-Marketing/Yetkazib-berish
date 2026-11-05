import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (key: string, s: string) => createHmac("sha256", key).update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

const HEX = /^(?:[0-9a-f]{2})+$/i;

/** Qat'iy hex: Buffer.from(..., "hex") noto'g'ri belgidan keyingisini jim tashlab yuboradi — shuning uchun avval format tekshiriladi. */
export function safeEqualHex(a: string, b: string): boolean {
  if (!HEX.test(a) || !HEX.test(b)) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

/** AES-256-GCM: `v1.iv.tag.ciphertext` (base64url). Sog'liq/TOTP kabi maxfiy maydonlar uchun. */
export function encrypt(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, "base64");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string, keyB64: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad ciphertext");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
