import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, isRequestAllowed } from "./session";

/**
 * Zweite Sicherheitsprüfung direkt in Seiten und API-Routen
 * (zusätzlich zum Proxy – so empfiehlt es die Next.js-Doku).
 */
export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return isRequestAllowed(store.get(SESSION_COOKIE)?.value);
}
