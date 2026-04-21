import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config.js";

// 32-байтный ключ AES выводим из env-секрета через scrypt. Без соли — чтобы один
// и тот же KEY_VAULT_MASTER на разных инстансах давал один ключ (записи, зашифрованные
// на API-инстансе, должны расшифровываться на воркере).
let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const master = config.api.keyVaultMaster;
  if (!master) {
    throw new Error(
      "[secret-vault] KEY_VAULT_MASTER is not set — cannot encrypt/decrypt provider keys",
    );
  }
  cachedKey = scryptSync(master, "metabox-vault", 32);
  return cachedKey;
}

/** Зашифровать строку. Формат вывода: base64(iv | tag | ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Расшифровать строку, ранее зашифрованную через encryptSecret. */
export function decryptSecret(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 28) {
    throw new Error("[secret-vault] ciphertext too short");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Маска для UI: показываем только последние 4 символа. */
export function maskKey(plain: string): string {
  if (plain.length <= 8) return "…" + plain.slice(-2);
  return "…" + plain.slice(-4);
}
