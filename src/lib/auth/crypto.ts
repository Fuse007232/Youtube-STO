import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Verschlüsselung für Google-Refresh-Tokens (AES-256-GCM).
 * Schlüssel: TOKEN_ENCRYPTION_KEY (nur in Vercel). Ohne den Schlüssel sind die
 * Tokens in der Datenbank wertlos.
 * Format: "v1.<iv>.<tag>.<daten>" (base64url)
 */

type Env = Record<string, string | undefined>;

function keyFrom(env: Env): Buffer {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY fehlt (Vercel → Settings → Environment Variables).");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string, env: Env = process.env): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(env), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(token: string, env: Env = process.env): string {
  const [v, iv, tag, data] = token.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unbekanntes Format des verschlüsselten Werts.");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(env), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/**
 * Signierter, kurzlebiger „state“ für den Google-Login: welcher Kanal verbunden
 * werden soll. Schützt davor, dass jemand fremde Antworten unterschiebt.
 */
export function createOAuthState(channelId: string, now = Date.now(), env: Env = process.env): string {
  const payload = Buffer.from(
    JSON.stringify({ c: channelId, e: now + 15 * 60_000, n: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  const sig = createHmac("sha256", env.SESSION_SECRET ?? "").update(`oauth.${payload}`).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string | null, now = Date.now(), env: Env = process.env): string | null {
  if (!state || !env.SESSION_SECRET) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", env.SESSION_SECRET).update(`oauth.${payload}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { c?: string; e?: number };
    if (!data.c || !data.e || data.e < now) return null;
    return data.c;
  } catch {
    return null;
  }
}
