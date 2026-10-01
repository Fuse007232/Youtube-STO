import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Passwortschutz fürs Dashboard (Phase 4).
 *
 * - Login mit einem Passwort (DASHBOARD_PASSWORD).
 * - Danach ein signiertes Cookie für 30 Tage. Signatur mit SESSION_SECRET,
 *   damit niemand ein Cookie fälschen kann.
 * - Das Passwort fließt (als Prüfsumme) in die Signatur ein:
 *   Passwort ändern → alle bisherigen Anmeldungen werden ungültig.
 */

export const SESSION_COOKIE = "sto_session";
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

type Env = Record<string, string | undefined>;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function sign(payload: string, env: Env): string {
  const pwFingerprint = sha256(env.DASHBOARD_PASSWORD ?? "").toString("hex");
  return createHmac("sha256", env.SESSION_SECRET ?? "")
    .update(`${payload}.${pwFingerprint}`)
    .digest("base64url");
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sind Passwort und Geheimwort eingetragen? */
export function isAuthConfigured(env: Env = process.env): boolean {
  return Boolean(env.DASHBOARD_PASSWORD && env.SESSION_SECRET);
}

/**
 * Muss man sich anmelden?
 * - eingerichtet → ja
 * - nicht eingerichtet + online (production) → ja (gesperrt, bis es eingerichtet ist – sicherer Standard)
 * - nicht eingerichtet + lokal (Entwicklung) → nein
 */
export function isAuthRequired(env: Env = process.env): boolean {
  return isAuthConfigured(env) || env.NODE_ENV === "production";
}

/** Prüft das eingegebene Passwort (zeitkonstant, verrät nichts über Länge oder Inhalt). */
export function checkPassword(input: string, env: Env = process.env): boolean {
  if (!isAuthConfigured(env)) return false;
  return safeEqual(sha256(input), sha256(env.DASHBOARD_PASSWORD!));
}

/** Erzeugt ein Anmelde-Token: „Ablaufzeit.Signatur“. */
export function createSessionToken(now = Date.now(), env: Env = process.env): string {
  const exp = String(Math.floor(now / 1000) + SESSION_MAX_AGE_SEC);
  return `${exp}.${sign(exp, env)}`;
}

/** Ist das Token echt und noch nicht abgelaufen? */
export function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
  env: Env = process.env,
): boolean {
  if (!token || !isAuthConfigured(env)) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 < now) return false;
  return safeEqual(Buffer.from(sig), Buffer.from(sign(exp, env)));
}

/** Darf diese Anfrage rein? (Cookie-Wert übergeben.) */
export function isRequestAllowed(cookieValue: string | undefined, env: Env = process.env): boolean {
  if (!isAuthRequired(env)) return true;
  return verifySessionToken(cookieValue, Date.now(), env);
}

/** Nur relative Weiterleitungen innerhalb der App erlauben (kein „//fremde-seite.de“). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
