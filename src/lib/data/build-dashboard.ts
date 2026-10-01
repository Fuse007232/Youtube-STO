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
import { channelShortStats } from "@/lib/metrics/standings";
import { buildUploadCalendar } from "@/lib/metrics/calendar";
import { analyzeCatalog } from "@/lib/metrics/catalog";
import { analyzeShortLength } from "@/lib/metrics/short-length";
import {
  buildTimingSamples,
  buildUploadTiming,
  type ActivityProfile,
  type FirstDayRow,
} from "@/lib/metrics/upload-timing";
import type {
  AlertItem,
  ChannelAnalytics,
  ChannelPoint,
  ChannelSummary,
  DashboardData,
  DataSourceKind,
  RankedShort,
  StandingsEntry,
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
  /** YouTube Analytics je Kanal (null/fehlend = Quelle ohne Analytics). */
  analytics?: ChannelAnalytics[] | null;
  alerts?: AlertItem[] | null;
  /**
   * Konkurrenten (Rohdaten wie `channels`, Shorts in `rivalShorts`). Fehlt es,
   * gibt es keine Fahrerwertung.
   */
  rivals?: RawChannelData[];
  rivalShorts?: RankedShort[];
  /**
   * Rohdaten für die Boxenstrategie (beste Upload-Uhrzeit). Fehlt es, gibt es
   * keine Auswertung (`uploadTiming: null`).
   */
  timing?: {
    /** Aufrufe nach 24 Std. für alle früh genug erfassten Shorts. */
    firstDay: FirstDayRow[];
    /** Aktivitätsprofil je eigenem Kanal. */
    activity: Map<string, ActivityProfile>;
  } | null;
  /** Aufrufe je Tag (Analytics) je eigenem Kanal – für den Upload-Kalender. */
  dailyViews?: Map<string, Map<string, number>>;
}

function summarize(raw: RawChannelData): ChannelSummary | null {
  const { points } = raw;
  if (points.length === 0) return null;
  const first = points[0];
  const last = points[points.length - 1];

  const videosDelta = (endT: number) => {
    const end = pointAt(points, endT);
    const start = pointAt(points, endT - 24 * HOUR_MS);
    return end && start ? end.videoCount - start.videoCount : null;
  };
  const videosSinceFirst = last.videoCount - first.videoCount;

  // Gibt es noch keine vollen 24 Stunden, zählt der Gewinn „seit Messbeginn“.
  const d24 = windowDelta(points, last.t, 24) ?? {
    views: last.views - first.views,
    subscribers: last.subscribers - first.subscribers,
  };
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
      views: d24.views,
      subscribers: d24.subscribers,
      videos: videosDelta(last.t) ?? videosSinceFirst,
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

  const historyHours =
    channels.length === 0
      ? 0
      : Math.min(
          ...input.channels.map((c) =>
            c.points.length > 1 ? (c.points[c.points.length - 1].t - c.points[0].t) / HOUR_MS : 0,
          ),
        );

  const limit = APP_CONFIG.topShortsLimit;
  // Ohne Verlauf sind 24h-/7-Tage-Ranglisten nicht berechenbar → leer lassen statt raten.
  const withHistory = (period: "24h" | "7d") =>
    input.hasHistory ? topShortsPerChannel(input.shorts, period, limit) : [];
  return {
    source: input.source,
    isDemo: input.isDemo,
    hasHistory: input.hasHistory,
    historyHours,
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
    analytics: input.analytics ?? null,
    alerts: input.alerts ?? null,
    standings: input.rivals ? buildStandings(channels, input) : null,
    ...buildAnalysis(input),
  };
}

/** Fahrerwertung: eigene Kanäle + Konkurrenten mit Zusatz-Kennzahlen. */
function buildStandings(own: ChannelSummary[], input: RawDashboardInput): StandingsEntry[] {
  const rivals = (input.rivals ?? []).map(summarize).filter((c): c is ChannelSummary => c !== null);
  const allShorts = [...input.shorts, ...(input.rivalShorts ?? [])];
  const entry = (summary: ChannelSummary, isOwn: boolean): StandingsEntry => ({
    summary,
    isOwn,
    ...channelShortStats(allShorts, summary.channel.id, input.now, input.hasHistory),
  });
  return [...own.map((c) => entry(c, true)), ...rivals.map((c) => entry(c, false))];
}

/** Auswertungen für die Analyse-Seite (Boxenstrategie, Short-Länge, Langzeit-Anteil, Kalender). */
function buildAnalysis(
  input: RawDashboardInput,
): Pick<DashboardData, "uploadTiming" | "shortLength" | "catalog" | "calendar"> {
  const ownChannelIds = input.channels.map((c) => c.channel.id);
  const rivalShorts = input.rivalShorts ?? [];
  const base = { ownChannelIds, ownShorts: input.shorts, rivalShorts, firstDay: input.timing?.firstDay ?? [], now: input.now };
  const samples = buildTimingSamples(base);
  const durations = new Map([...input.shorts, ...rivalShorts].map((s) => [s.id, s.durationSec]));

  return {
    uploadTiming: input.timing ? buildUploadTiming({ ...base, activity: input.timing.activity }, samples) : null,
    shortLength:
      input.shorts.length === 0
        ? null
        : [
            ...ownChannelIds.map((id) => analyzeShortLength(id, samples.own.get(id) ?? [], durations)),
            ...(rivalShorts.length > 0 ? [analyzeShortLength("competitors", samples.rivals, durations)] : []),
          ],
    catalog: input.hasHistory ? analyzeCatalog(ownChannelIds, input.shorts, input.now) : null,
    calendar: ownChannelIds.map((channelId) =>
      buildUploadCalendar({ channelId, shorts: input.shorts, dailyViews: input.dailyViews?.get(channelId), now: input.now }),
    ),
  };
}
