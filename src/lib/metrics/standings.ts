import type { RankedShort, StandingsEntry } from "@/lib/data/types";

const DAY = 86_400_000;

/**
 * Zusatz-Kennzahlen eines Kanals für die Fahrerwertung – aus seinen (beobachteten) Shorts.
 */
export function channelShortStats(
  shorts: RankedShort[],
  channelId: string,
  now: number,
  hasHistory = true,
): Pick<StandingsEntry, "uploads7d" | "avgViewsPerShort30d" | "bestShort24h"> {
  const own = shorts.filter((s) => s.channelId === channelId);
  const uploads7d = own.filter((s) => s.publishedAt > now - 7 * DAY && s.publishedAt <= now).length;
  const recent = own.filter((s) => s.publishedAt > now - 30 * DAY && s.publishedAt <= now);
  const avgViewsPerShort30d =
    recent.length > 0 ? recent.reduce((sum, s) => sum + s.views, 0) / recent.length : null;
  const best = hasHistory
    ? own.reduce<RankedShort | null>((b, s) => (s.views24h > (b?.views24h ?? 0) ? s : b), null)
    : null;
  return {
    uploads7d,
    avgViewsPerShort30d,
    bestShort24h: best
      ? { id: best.id, title: best.title, views24h: best.views24h, thumbnailUrl: best.thumbnailUrl }
      : null,
  };
}

export type StandingsMetric = "views" | "subscribers" | "pace" | "avgPerShort" | "uploads7d";
/** Zeitraum für „Aufrufe“ (28 Tage gibt es für Konkurrenten nicht → 7 Tage). */
export type StandingsRange = "24h" | "7d" | "all";

/** Aufrufe eines Kanals im Zeitraum (7 Tage aus dem gespeicherten Verlauf). */
export function standingsViews(e: StandingsEntry, range: StandingsRange): number {
  const s = e.summary;
  if (range === "24h") return s.delta24h.views;
  if (range === "all") return s.current.views;
  return s.current.views - (s.history7d[0]?.views ?? s.current.views);
}

/** Wert einer Zeile für die gewählte Sortierung. */
export function standingsValue(e: StandingsEntry, metric: StandingsMetric, range: StandingsRange = "24h"): number {
  switch (metric) {
    case "views":
      return standingsViews(e, range);
    case "subscribers":
      return e.summary.current.subscribers;
    case "pace":
      return e.summary.rate.viewsPerSecond * 3600;
    case "avgPerShort":
      return e.avgViewsPerShort30d ?? 0;
    case "uploads7d":
      return e.uploads7d;
  }
}

/** Sortiert absteigend; bei Gleichstand eigene Kanäle zuerst, dann nach Name. */
export function sortStandings(
  entries: StandingsEntry[],
  metric: StandingsMetric,
  range: StandingsRange = "24h",
): StandingsEntry[] {
  return [...entries].sort(
    (a, b) =>
      standingsValue(b, metric, range) - standingsValue(a, metric, range) ||
      Number(b.isOwn) - Number(a.isOwn) ||
      a.summary.channel.name.localeCompare(b.summary.channel.name),
  );
}
