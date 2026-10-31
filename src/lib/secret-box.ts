import crypto from "node:crypto";

// Encrypts secrets we must be able to read back (companies' email passwords)
// with AES-256-GCM. The key comes from EMAIL_ENCRYPTION_KEY.

function key(): Buffer {
  const secret = process.env.EMAIL_ENCRYPTION_KEY;
  if (secret) return crypto.createHash("sha256").update(secret).digest();
  if (process.env.NODE_ENV === "production") throw new Error("EMAIL_ENCRYPTION_KEY is not set.");
  return crypto.createHash("sha256").update("brightloop-development-only-key").digest();
}

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function unseal(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unreadable secret.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
