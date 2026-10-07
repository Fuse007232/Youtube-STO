import { TrackerInputError } from "./validate";

/** Fehlerantwort der Tracker-API: Eingabefehler → 400 (Text für den Nutzer), sonst 502. */
export function trackerError(e: unknown): Response {
  const headers = { "Cache-Control": "no-store" };
  if (e instanceof TrackerInputError) return Response.json({ error: e.message }, { status: 400, headers });
  console.error("[api/tracker]", e);
  return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502, headers });
}
