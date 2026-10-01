import type { AnalyticsDay } from "@/lib/data/types";
import type { AnalyticsStore, AnalyticsVideoRow, RunTrigger, SnapshotStore } from "@/lib/db/store";
import { decryptSecret } from "@/lib/auth/crypto";
import { fetchChannelAnalytics, type ReportRow } from "@/lib/youtube/analytics";
import { OAuthError, isOAuthConfigured, refreshAccessToken } from "@/lib/youtube/oauth";

/**
 * Holt YouTube-Analytics-Daten für alle verbundenen Kanäle und speichert sie.
 * Läuft über den Zeitplaner höchstens alle 6 Stunden (die Daten ändern sich
 * ohnehin nur ~1× pro Tag) und sofort nach dem Verbinden eines Kanals.
 * Kostet KEIN Data-API-Kontingent (eigenes Analytics-Kontingent).
 */

export const ANALYTICS_EVERY_MS = 6 * 60 * 60_000;
export const ANALYTICS_PERIOD = "28d";

type Env = Record<string, string | undefined>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

export function mapDailyRow(r: ReportRow): AnalyticsDay {
  return {
    day: String(r.day),
    views: num(r.views),
    engagedViews: r.engagedViews === undefined ? null : num(r.engagedViews),
    minutesWatched: num(r.estimatedMinutesWatched),
    avgViewSec: num(r.averageViewDuration),
    avgViewPct: num(r.averageViewPercentage),
    subsGained: num(r.subscribersGained),
    subsLost: num(r.subscribersLost),
    likes: num(r.likes),
    shares: num(r.shares),
    comments: num(r.comments),
  };
}

export function mapVideoRow(r: ReportRow, channelId: string): AnalyticsVideoRow {
  return {
    videoId: String(r.video),
    channelId,
    views: num(r.views),
    minutesWatched: num(r.estimatedMinutesWatched),
    avgViewSec: num(r.averageViewDuration),
    avgViewPct: num(r.averageViewPercentage),
    subsGained: num(r.subscribersGained),
    likes: num(r.likes),
    shares: num(r.shares),
  };
}

export interface RunAnalyticsOptions {
  store: AnalyticsStore & Pick<SnapshotStore, "startRun" | "finishRun" | "recentRuns">;
  trigger: RunTrigger;
  /** Auch laufen, wenn der letzte Abruf noch keine 6 Stunden her ist. */
  force?: boolean;
  /** Nur diesen Kanal abrufen (z. B. direkt nach dem Verbinden). */
  onlyChannel?: string;
  now?: number;
  fetchFn?: typeof fetch;
  env?: Env;
}

export interface RunAnalyticsResult {
  channels: { channelId: string; ok: boolean; days?: number; shorts?: number; error?: string }[];
}

export async function runAnalyticsIfDue(opts: RunAnalyticsOptions): Promise<RunAnalyticsResult | null> {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now();
  const fetchFn = opts.fetchFn ?? fetch;
  const { store } = opts;
  if (!isOAuthConfigured(env)) return null;

  const connections = (await store.getConnections()).filter(
    (c) => !opts.onlyChannel || c.channelId === opts.onlyChannel,
  );
  if (connections.length === 0) return null;

  if (!opts.force) {
    const runs = await store.recentRuns(now - ANALYTICS_EVERY_MS);
    if (runs.some((r) => r.mode === "analytics" && r.ok === true)) return null;
  }

  const runId = await store.startRun("analytics", opts.trigger, now);
  const result: RunAnalyticsResult = { channels: [] };

  for (const conn of connections) {
    try {
      const refreshToken = decryptSecret(conn.refreshTokenEnc, env);
      const accessToken = await refreshAccessToken(refreshToken, fetchFn, env);
      const report = await fetchChannelAnalytics(accessToken, now, fetchFn);

      await store.upsertAnalyticsDaily(conn.channelId, report.daily.map(mapDailyRow));
      const videos = report.videos.map((r) => mapVideoRow(r, conn.channelId));
      await store.replaceAnalyticsVideos(conn.channelId, ANALYTICS_PERIOD, report.endDate, videos);
      const breakdown = (rows: ReportRow[], keyField: string) =>
        rows.map((r) => ({
          key: String(r[keyField]),
          views: num(r.views),
          minutesWatched: num(r.estimatedMinutesWatched),
        }));
      await store.replaceBreakdowns(
        conn.channelId,
        "traffic",
        ANALYTICS_PERIOD,
        report.endDate,
        breakdown(report.traffic, "insightTrafficSourceType"),
      );
      await store.replaceBreakdowns(
        conn.channelId,
        "country",
        ANALYTICS_PERIOD,
        report.endDate,
        breakdown(report.countries, "country"),
      );
      await store.updateConnectionStatus(conn.channelId, { lastUsedAt: now, lastError: null });
      result.channels.push({ channelId: conn.channelId, ok: true, days: report.daily.length, shorts: videos.length });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[analytics] ${conn.channelId}:`, message);
      await store.updateConnectionStatus(conn.channelId, {
        lastError: e instanceof OAuthError && e.needsReconnect ? message : `Abruf fehlgeschlagen: ${message}`,
      });
      result.channels.push({ channelId: conn.channelId, ok: false, error: message });
    }
  }

  const failed = result.channels.filter((c) => !c.ok);
  await store.finishRun(runId, {
    at: Date.now(),
    units: 0,
    videos: result.channels.reduce((s, c) => s + (c.shorts ?? 0), 0),
    ok: failed.length === 0,
    error: failed.length ? failed.map((f) => `${f.channelId}: ${f.error}`).join(" | ") : undefined,
  });
  return result;
}
