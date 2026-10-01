import { CHANNELS, type ChannelConfig } from "@/config/channels";
import { buildDashboard } from "@/lib/data/build-dashboard";
import type { DashboardData, DataSource } from "@/lib/data/types";
import type { AlertStore, AnalyticsStore, CompetitorStore, DashboardReader, TimingStore } from "@/lib/db/store";
import { activityFromHourly, type ActivityProfile, type FirstDayRow } from "@/lib/metrics/upload-timing";
import { COMPETITOR_CONFIG } from "@/config/competitors";
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
  /** Konkurrenten lesen (Phase 6.3). Fehlt es, gibt es keine Fahrerwertung. */
  competitors?: Pick<CompetitorStore, "getCompetitors">;
  /** Boxenstrategie-Rohdaten lesen (Phase 6.2). Fehlt es, gibt es keine Upload-Uhrzeit-Auswertung. */
  timing?: TimingStore;
  /**
   * Zwischenspeicher für die Boxenstrategie-Rohdaten (ändern sich nur mit neuen
   * Schnappschüssen). Am besten ein Objekt, das über mehrere Anfragen lebt.
   */
  timingCache?: TimingCache;
}

type TimingRaw = { firstDay: FirstDayRow[]; activity: Map<string, ActivityProfile> };
export interface TimingCache {
  key?: number;
  value?: TimingRaw;
}

/** So viele Tage Kanal-Verlauf fließen ins Aktivitätsprofil. */
const ACTIVITY_DAYS = 14;

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

    const rivals = await this.loadRivals(now);

    const [analyticsData, alerts, timing] = await Promise.all([
      this.opts.analytics ? this.loadAnalytics(ids, rankings, now) : Promise.resolve(null),
      this.opts.alerts
        ? this.opts.alerts.getRecentAlerts(now - 7 * 24 * HOUR_MS, 20).catch((e) => {
            console.error("[alerts] Lesen fehlgeschlagen:", e);
            return null;
          })
        : Promise.resolve(null),
      this.loadTiming(now, lastSnapshotAt),
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
      analytics: analyticsData?.analytics ?? null,
      dailyViews: analyticsData?.dailyViews,
      alerts,
      rivals: rivals?.raw,
      rivalShorts: rivals ? rankings.filter((s) => rivals.ids.has(s.channelId)) : undefined,
      timing,
    });
  }

  /** Rohdaten der Boxenstrategie – je Schnappschuss nur einmal aus der Datenbank. */
  private async loadTiming(now: number, lastSnapshotAt: number): Promise<TimingRaw | null> {
    const store = this.opts.timing;
    if (!store) return null;
    const cache = this.opts.timingCache;
    if (cache?.value && cache.key === lastSnapshotAt) return cache.value;
    try {
      const [firstDay, hourly] = await Promise.all([
        store.getFirstDayViews(24, now),
        store.getHourlyActivity(ACTIVITY_DAYS, now),
      ]);
      const value = { firstDay, activity: activityFromHourly(hourly) };
      if (cache) {
        cache.key = lastSnapshotAt;
        cache.value = value;
      }
      return value;
    } catch (e) {
      console.error("[timing] Lesen fehlgeschlagen:", e);
      return null;
    }
  }

  /** Konkurrenten mit Verlauf laden. Fehler legen das Dashboard nicht lahm. */
  private async loadRivals(now: number) {
    if (!this.opts.competitors) return null;
    try {
      const competitors = (await this.opts.competitors.getCompetitors()).slice(0, COMPETITOR_CONFIG.maxCompetitors);
      const ids = competitors.map((c) => c.id);
      const [meta, points] = await Promise.all([
        ids.length ? this.reader.getChannels(ids) : Promise.resolve([]),
        Promise.all(ids.map((id) => this.reader.getChannelPoints(id, now - HISTORY_MS))),
      ]);
      const avatar = new Map(meta.map((m) => [m.id, m.avatarUrl]));
      return {
        ids: new Set(ids),
        raw: competitors.map((channel, i) => ({
          channel,
          points: points[i],
          subscribersRounded: true,
          avatarUrl: avatar.get(channel.id) ?? null,
        })),
      };
    } catch (e) {
      console.error("[competitors] Lesen fehlgeschlagen:", e);
      return null;
    }
  }

  /** Analytics je Kanal laden. Fehler hier legen nicht das ganze Dashboard lahm. */
  private async loadAnalytics(
    ids: string[],
    rankings: RankedShort[],
    now: number,
  ): Promise<{ analytics: ChannelAnalytics[]; dailyViews: Map<string, Map<string, number>> } | null> {
    const reader = this.opts.analytics!;
    try {
      const since = new Date(now - 40 * 24 * HOUR_MS).toISOString().slice(0, 10);
      // Für den Upload-Kalender: ein halbes Jahr Tageswerte
      const sinceCalendar = new Date(now - 190 * 24 * HOUR_MS).toISOString().slice(0, 10);
      const [connections, allDaily, videos, breakdowns] = await Promise.all([
        reader.getConnections(),
        reader.getAnalyticsDaily(ids, sinceCalendar),
        reader.getAnalyticsVideos(ids, ANALYTICS_PERIOD),
        reader.getBreakdowns(ids, ANALYTICS_PERIOD),
      ]);
      const videoInfo = new Map(rankings.map((r) => [r.id, r]));
      const daily = allDaily.filter((d) => d.day >= since);
      const dailyViews = new Map(
        ids.map((id) => [id, new Map(allDaily.filter((d) => d.channelId === id).map((d) => [d.day, d.views]))]),
      );
      const analytics = ids.map((channelId) =>
        buildChannelAnalytics({
          channelId,
          connection: connections.find((c) => c.channelId === channelId),
          daily: daily.filter((d) => d.channelId === channelId),
          videos,
          breakdowns,
          videoInfo,
        }),
      );
      return { analytics, dailyViews };
    } catch (e) {
      console.error("[analytics] Lesen fehlgeschlagen:", e);
      return null;
    }
  }
}
