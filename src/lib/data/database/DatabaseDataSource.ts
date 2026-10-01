import { CHANNELS, type ChannelConfig } from "@/config/channels";
import { buildDashboard } from "@/lib/data/build-dashboard";
import type { DashboardData, DataSource } from "@/lib/data/types";
import type { AlertStore, AnalyticsStore, DashboardReader } from "@/lib/db/store";
import { buildChannelAnalytics } from "@/lib/analytics/build";
import { ANALYTICS_PERIOD } from "@/lib/analytics/run-analytics";
import type { ChannelAnalytics, RankedShort } from "@/lib/data/types";
import { HOUR_MS } from "@/lib/metrics/deltas";
import { quotaDayKey } from "@/lib/youtube/quota";
import { APP_CONFIG } from "@/config/app";

/**
 * Dashboard-Daten aus der eigenen Datenbank (ab Phase 3).
 * Das Öffnen des Dashboards kostet damit KEIN YouTube-Kontingent.
 *
 * Extras:
 * - Ist der letzte Schnappschuss überfällig, wird über `onStale` ein neuer angestoßen
 *   („Selbstauslöser“ – ergänzt den Zeitplaner, ersetzt ihn aber nicht).
 * - Gibt es noch gar keine Schnappschüsse, springt `fallback` ein (z. B. YouTube direkt).
 */

/** So viel Verlauf wird geladen: 8 Tage (24h + Vortag + 7-Tage-Kurve). */
const HISTORY_MS = 8 * 24 * HOUR_MS;

export interface DatabaseSourceOptions {
  channels?: ChannelConfig[];
  /** Wird aufgerufen, wenn der letzte Schnappschuss überfällig ist (oder es keinen gibt). */
  onStale?: () => void;
  /** Datenquelle für den Fall „noch keine Schnappschüsse“. */
  fallback?: DataSource;
  /** Analytics lesen (Phase 5). Fehlt es, gibt es keine Analytics-Widgets. */
  analytics?: Pick<AnalyticsStore, "getConnections" | "getAnalyticsDaily" | "getAnalyticsVideos" | "getBreakdowns">;
  /** Alarme lesen (Phase 6). Fehlt es, gibt es kein Boxenfunk-Widget. */
  alerts?: Pick<AlertStore, "getRecentAlerts">;
}

export class DatabaseDataSource implements DataSource {
  readonly kind = "database" as const;

  constructor(
    private readonly reader: DashboardReader,
    private readonly opts: DatabaseSourceOptions = {},
  ) {}

  async getDashboard(now = Date.now()): Promise<DashboardData> {
    const channels = this.opts.channels ?? CHANNELS;
    const ids = channels.map((c) => c.id);

    const [meta, pointsPerChannel, rankings, runs] = await Promise.all([
      this.reader.getChannels(ids),
      Promise.all(ids.map((id) => this.reader.getChannelPoints(id, now - HISTORY_MS))),
      this.reader.getVideoRankings(now),
      this.reader.recentRuns(now - 24 * HOUR_MS),
    ]);

    const lastSnapshotAt = Math.max(0, ...pointsPerChannel.flat().map((p) => p.t));
    const overdueMs = (APP_CONFIG.snapshotIntervalMin + 3) * 60_000;
    if (now - lastSnapshotAt > overdueMs) this.opts.onStale?.();

    if (pointsPerChannel.every((p) => p.length === 0)) {
      if (this.opts.fallback) return this.opts.fallback.getDashboard(now);
      throw new Error(
        "Die Datenbank hat noch keine Schnappschüsse. Der erste wird gerade angestoßen – bitte in einer Minute neu laden.",
      );
    }

    const avatarById = new Map(meta.map((m) => [m.id, m.avatarUrl]));
    const today = quotaDayKey(now);
    const quotaUsedToday = runs
      .filter((r) => quotaDayKey(r.startedAt) === today)
      .reduce((sum, r) => sum + r.units, 0);

    const [analytics, alerts] = await Promise.all([
      this.opts.analytics ? this.loadAnalytics(ids, rankings, now) : Promise.resolve(null),
      this.opts.alerts
        ? this.opts.alerts.getRecentAlerts(now - 7 * 24 * HOUR_MS, 20).catch((e) => {
            console.error("[alerts] Lesen fehlgeschlagen:", e);
            return null;
          })
        : Promise.resolve(null),
    ]);

    return buildDashboard({
      source: this.kind,
      isDemo: false,
      hasHistory: pointsPerChannel.every((p) => p.length >= 2),
      now,
      channels: channels.map((channel, i) => ({
        channel,
        points: pointsPerChannel[i],
        subscribersRounded: true,
        avatarUrl: avatarById.get(channel.id) ?? null,
      })),
      shorts: rankings.filter((s) => ids.includes(s.channelId)),
      quotaUsedToday,
      analytics,
      alerts,
    });
  }

  /** Analytics je Kanal laden. Fehler hier legen nicht das ganze Dashboard lahm. */
  private async loadAnalytics(ids: string[], rankings: RankedShort[], now: number): Promise<ChannelAnalytics[] | null> {
    const reader = this.opts.analytics!;
    try {
      const since = new Date(now - 40 * 24 * HOUR_MS).toISOString().slice(0, 10);
      const [connections, daily, videos, breakdowns] = await Promise.all([
        reader.getConnections(),
        reader.getAnalyticsDaily(ids, since),
        reader.getAnalyticsVideos(ids, ANALYTICS_PERIOD),
        reader.getBreakdowns(ids, ANALYTICS_PERIOD),
      ]);
      const videoInfo = new Map(rankings.map((r) => [r.id, r]));
      return ids.map((channelId) =>
        buildChannelAnalytics({
          channelId,
          connection: connections.find((c) => c.channelId === channelId),
          daily: daily.filter((d) => d.channelId === channelId),
          videos,
          breakdowns,
          videoInfo,
        }),
      );
    } catch (e) {
      console.error("[analytics] Lesen fehlgeschlagen:", e);
      return null;
    }
  }
}
