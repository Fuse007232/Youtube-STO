import { APP_CONFIG } from "@/config/app";
import type { ChannelConfig } from "@/config/channels";
import {
  HOUR_MS,
  bestRollingDelta,
  downsample,
  pointAt,
  viewsPerSecond,
  windowDelta,
} from "@/lib/metrics/deltas";
import { topShortsPerChannel } from "@/lib/metrics/ranking";
import type {
  ChannelPoint,
  ChannelSummary,
  DashboardData,
  DataSourceKind,
  RankedShort,
} from "./types";

/**
 * Rohdaten, wie sie jede Datenquelle liefern kann:
 * pro Kanal ein Verlauf von Schnappschüssen + eine Liste aller Shorts.
 * Hieraus wird die fertige Dashboard-Antwort berechnet – für alle Quellen gleich.
 */
export interface RawChannelData {
  channel: ChannelConfig;
  /** Schnappschüsse, aufsteigend sortiert. Ideal: mindestens 8 Tage. */
  points: ChannelPoint[];
  subscribersRounded: boolean;
  avatarUrl: string | null;
}

export interface RawDashboardInput {
  source: DataSourceKind;
  isDemo: boolean;
  /** false = nur aktueller Stand, keine Schnappschüsse (24h-Werte nicht verfügbar). */
  hasHistory: boolean;
  /** Standard: Schnappschuss-Abstand aus APP_CONFIG. */
  refreshIntervalMin?: number;
  now: number;
  channels: RawChannelData[];
  shorts: RankedShort[];
  quotaUsedToday: number | null;
}

function summarize(raw: RawChannelData): ChannelSummary | null {
  const { points } = raw;
  if (points.length === 0) return null;
  const last = points[points.length - 1];

  const videosDelta = (endT: number) => {
    const end = pointAt(points, endT);
    const start = pointAt(points, endT - 24 * HOUR_MS);
    return end && start ? end.videoCount - start.videoCount : null;
  };

  const d24 = windowDelta(points, last.t, 24);
  const prev = windowDelta(points, last.t - 24 * HOUR_MS, 24);
  const prevVideos = videosDelta(last.t - 24 * HOUR_MS);

  return {
    channel: raw.channel,
    avatarUrl: raw.avatarUrl,
    current: {
      subscribers: last.subscribers,
      views: last.views,
      videoCount: last.videoCount,
    },
    subscribersRounded: raw.subscribersRounded,
    delta24h: {
      views: d24?.views ?? 0,
      subscribers: d24?.subscribers ?? 0,
      videos: videosDelta(last.t) ?? 0,
    },
    prevDelta24h:
      prev && prevVideos !== null ? { ...prev, videos: prevVideos } : null,
    best24h: bestRollingDelta(points, 24),
    rate: { viewsPerSecond: viewsPerSecond(points) },
    history24h: points.filter((p) => p.t >= last.t - 24 * HOUR_MS),
    history7d: downsample(
      points.filter((p) => p.t >= last.t - 7 * 24 * HOUR_MS),
      HOUR_MS,
    ),
  };
}

export function buildDashboard(input: RawDashboardInput): DashboardData {
  const channels = input.channels
    .map(summarize)
    .filter((c): c is ChannelSummary => c !== null);

  const lastSnapshotAt = Math.max(
    0,
    ...channels.map((c) => c.history24h[c.history24h.length - 1]?.t ?? 0),
  );

  const limit = APP_CONFIG.topShortsLimit;
  // Ohne Verlauf sind 24h-/7-Tage-Ranglisten nicht berechenbar → leer lassen statt raten.
  const withHistory = (period: "24h" | "7d") =>
    input.hasHistory ? topShortsPerChannel(input.shorts, period, limit) : [];
  return {
    source: input.source,
    isDemo: input.isDemo,
    hasHistory: input.hasHistory,
    generatedAt: input.now,
    lastSnapshotAt,
    snapshotIntervalMin: input.refreshIntervalMin ?? APP_CONFIG.snapshotIntervalMin,
    channels,
    topShorts: {
      "24h": withHistory("24h"),
      "7d": withHistory("7d"),
      all: topShortsPerChannel(input.shorts, "all", limit),
    },
    quota: {
      usedToday: input.quotaUsedToday,
      dailyLimit: APP_CONFIG.youtubeDailyQuota,
    },
  };
}
