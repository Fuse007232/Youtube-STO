import type { DataSourceKind } from "./types";

/**
 * Welche Datenquelle soll laufen?
 * - DATA_SOURCE gesetzt → genau diese ("mock" | "youtube" | "database").
 * - sonst automatisch: YOUTUBE_API_KEY vorhanden → "youtube", ansonsten "mock".
 */
export function resolveDataSourceKind(
  env: Record<string, string | undefined> = process.env,
): DataSourceKind {
  const explicit = env.DATA_SOURCE?.trim();
  if (explicit === "mock" || explicit === "youtube" || explicit === "database") return explicit;
  return env.YOUTUBE_API_KEY ? "youtube" : "mock";
}
