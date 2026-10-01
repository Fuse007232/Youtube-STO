import type { RankedShort, RankingPeriod } from "@/lib/data/types";

/** Welche Zahl für die Rangliste im jeweiligen Zeitraum zählt. */
export function metricFor(short: RankedShort, period: RankingPeriod): number {
  switch (period) {
    case "24h":
      return short.views24h;
    case "7d":
      return short.views7d;
    case "all":
      return short.views;
  }
}

/** Sortiert absteigend nach der Zahl des Zeitraums und nimmt die ersten `limit`. */
export function rankShorts(
  shorts: RankedShort[],
  period: RankingPeriod,
  limit: number,
): RankedShort[] {
  return [...shorts]
    .sort((a, b) => metricFor(b, period) - metricFor(a, period))
    .slice(0, limit);
}

/**
 * Die besten `limit` Shorts je Kanal, zusammengeführt und sortiert.
 * So kann das Widget „Alle“ und jeden einzelnen Kanal korrekt anzeigen.
 */
export function topShortsPerChannel(
  shorts: RankedShort[],
  period: RankingPeriod,
  limit: number,
): RankedShort[] {
  const byChannel = new Map<string, RankedShort[]>();
  for (const s of shorts) {
    const list = byChannel.get(s.channelId) ?? [];
    list.push(s);
    byChannel.set(s.channelId, list);
  }
  const merged = [...byChannel.values()].flatMap((list) =>
    rankShorts(list, period, limit),
  );
  return rankShorts(merged, period, merged.length);
}
