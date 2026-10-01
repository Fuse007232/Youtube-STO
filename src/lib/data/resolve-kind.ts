import type { DataSourceKind } from "./types";

/**
 * Welche Datenquelle soll laufen?
 * - DATA_SOURCE gesetzt → genau diese ("mock" | "youtube" | "database").
 * - sonst automatisch:
 *     SUPABASE_URL + SUPABASE_SECRET_KEY → "database" (ab Phase 3)
 *     YOUTUBE_API_KEY                    → "youtube"  (Phase 2)
 *     nichts davon                       → "mock"     (Beispieldaten)
 */
export function resolveDataSourceKind(
  env: Record<string, string | undefined> = process.env,
): DataSourceKind {
  const explicit = env.DATA_SOURCE?.trim();
  if (explicit === "mock" || explicit === "youtube" || explicit === "database") return explicit;
  if (env.SUPABASE_URL && env.SUPABASE_SECRET_KEY) return "database";
  return env.YOUTUBE_API_KEY ? "youtube" : "mock";
}
