import type { AnalyticsDay, AnalyticsShort, ChannelAnalytics, RankedShort } from "@/lib/data/types";
import type { AnalyticsVideoRow, BreakdownRow, OAuthConnectionRow } from "@/lib/db/store";
import { countryLabel, subsPer1k, toBreakdown, totalsFromDaily, trafficLabel } from "@/lib/metrics/analytics";

/** Wie viele Shorts das Dashboard pro Kanal mit Analytics-Werten bekommt. */
const SHORTS_LIMIT = 20;

/** Eine gespeicherte Analytics-Zeile + Titel/Bild → Dashboard-Form eines Shorts. */
export function analyticsShortFrom(
  v: AnalyticsVideoRow,
  info: Pick<RankedShort, "title" | "thumbnailUrl" | "publishedAt"> | undefined,
): AnalyticsShort {
  return {
    id: v.videoId,
    title: info?.title ?? "(Short nicht mehr in der Upload-Liste)",
    thumbnailUrl: info?.thumbnailUrl ?? null,
    publishedAt: info?.publishedAt ?? null,
    views: v.views,
    minutesWatched: v.minutesWatched,
    avgViewSec: v.avgViewSec,
    avgViewPct: v.avgViewPct,
    subsGained: v.subsGained,
    subsPer1k: subsPer1k(v.subsGained, v.views),
    likes: v.likes,
    shares: v.shares,
  };
}

/**
 * Baut aus den gespeicherten Analytics-Daten die Dashboard-Form für einen Kanal.
 * Titel/Vorschaubilder kommen aus der Video-Tabelle (`videoInfo`).
 */
export function buildChannelAnalytics(input: {
  channelId: string;
  connection: OAuthConnectionRow | undefined;
  daily: AnalyticsDay[];
  videos: AnalyticsVideoRow[];
  breakdowns: BreakdownRow[];
  videoInfo: Map<string, Pick<RankedShort, "title" | "thumbnailUrl" | "publishedAt">>;
}): ChannelAnalytics {
  const daily = [...input.daily].sort((a, b) => a.day.localeCompare(b.day));
  const shorts: AnalyticsShort[] = input.videos
    .filter((v) => v.channelId === input.channelId)
    .map((v) => analyticsShortFrom(v, input.videoInfo.get(v.videoId)))
    .sort((a, b) => b.subsGained - a.subsGained || b.views - a.views)
    .slice(0, SHORTS_LIMIT);

  const of = (kind: BreakdownRow["kind"]) =>
    input.breakdowns.filter((b) => b.channelId === input.channelId && b.kind === kind);

  return {
    channelId: input.channelId,
    connected: Boolean(input.connection),
    error: input.connection?.lastError ?? null,
    lastDay: daily.at(-1)?.day ?? null,
    daily,
    totals28d: totalsFromDaily(daily, 28),
    shorts,
    traffic: toBreakdown(of("traffic"), trafficLabel, 6),
    countries: toBreakdown(of("country"), countryLabel, 8),
  };
}
