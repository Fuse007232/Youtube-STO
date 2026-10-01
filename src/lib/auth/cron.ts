import { timingSafeEqual } from "node:crypto";

/** Prüft `Authorization: Bearer <CRON_SECRET>` (Supabase-Zeitplaner und Vercel-Cron). */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
