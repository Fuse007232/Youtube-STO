import { CHANNELS, type ChannelConfig } from "@/config/channels";
import { buildDashboard } from "@/lib/data/build-dashboard";
import type { DashboardData, DataSource } from "@/lib/data/types";
import type {
  AlertStore,
  AnalyticsStore,
  CommentStore,
  CompetitorStore,
  DashboardReader,
  ShortStore,
  TimingStore,
  TrackerStore,
} from "@/lib/db/store";
import { addDays, berlinDay } from "@/lib/metrics/calendar";
import { analyticsShortFrom } from "@/lib/analytics/build";
import { channelRank, shortTiming } from "@/lib/metrics/short-detail";
import { buildTimingSamples } from "@/lib/metrics/upload-timing";
import { activityFromHourly, type ActivityProfile, type FirstDayRow } from "@/lib/metrics/upload-timing";
import { COMPETITOR_CONFIG } from "@/config/competitors";
import { buildChannelAnalytics } from "@/lib/analytics/build";
import { ANALYTICS_PERIOD } from "@/lib/analytics/run-analytics";
import type { ChannelAnalytics, RankedShort, ShortDetail } from "@/lib/data/types";
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
  /** Short-Steckbriefe lesen (Phase 7). Fehlt es, gibt es keine Steckbriefe. */
  shorts?: ShortStore;
  /** Kommentare lesen (Phase 7). Fehlt es, gibt es keinen Kommentar-Puls. */
  comments?: Pick<CommentStore, "getRecentComments" | "getTopComments" | "getVideoComments" | "getCommentGains">;
  /** Produktion lesen (Phase 9). Fehlt es, gibt es keine Produktions-Kurzfassung. */
  tracker?: Pick<TrackerStore, "listProductionItems" | "getProductionTargets">;
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

    const [analyticsData, alerts, timing, comments, production] = await Promise.all([
      this.opts.analytics ? this.loadAnalytics(ids, rankings, now) : Promise.resolve(null),
      this.opts.alerts
        ? this.opts.alerts.getRecentAlerts(now - 7 * 24 * HOUR_MS, 20).catch((e) => {
            console.error("[alerts] Lesen fehlgeschlagen:", e);
            return null;
          })
        : Promise.resolve(null),
      this.loadTiming(now, lastSnapshotAt),
      this.loadComments(ids, now),
      this.loadProduction(now),
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
      views28d: analyticsData && analyticsData.views28d.size > 0 ? analyticsData.views28d : undefined,
      alerts,
      rivals: rivals?.raw,
      rivalShorts: rivals ? rankings.filter((s) => rivals.ids.has(s.channelId)) : undefined,
      timing,
      comments,
      production,
    });
  }

  /** Produktions-Einträge (eine Woche zurück bis ein Monat voraus) + Tagesziele. */
  private async loadProduction(now: number) {
    const store = this.opts.tracker;
    if (!store) return null;
    try {
      const today = berlinDay(now);
      const [items, targets] = await Promise.all([
        store.listProductionItems(addDays(today, -7), addDays(today, 31)),
        store.getProductionTargets(),
      ]);
      return { items, targets };
    } catch (e) {
      console.error("[production] Lesen fehlgeschlagen:", e);
      return null;
    }
  }

  /** Kommentar-Puls laden. Fehler legen das Dashboard nicht lahm. */
  private async loadComments(ids: string[], now: number) {
    const store = this.opts.comments;
    if (!store) return null;
    try {
      const [recent, top, gains] = await Promise.all([
        store.getRecentComments(ids, 12),
        store.getTopComments(ids, now - 7 * 24 * HOUR_MS, 8),
        store.getCommentGains(now),
      ]);
      return { recent, top, gains };
    } catch (e) {
      console.error("[comments] Lesen fehlgeschlagen:", e);
      return null;
    }
  }

  /** Steckbrief eines Shorts (eigener Kanal oder Konkurrent). */
  async getShortDetail(id: string, now = Date.now()): Promise<ShortDetail | null> {
    const store = this.opts.shorts;
    if (!store) return null;
    const video = await store.getVideo(id);
    if (!video || video.publishedAt === null) return null;

    const own = (this.opts.channels ?? CHANNELS).find((c) => c.id === video.channelId);
    const channel =
      own ?? (await this.opts.competitors?.getCompetitors())?.find((c) => c.id === video.channelId) ?? null;
    if (!channel) return null;

    const [history, rankings, firstDay, analyticsRows] = await Promise.all([
      store.getVideoHistory(id),
      this.reader.getVideoRankings(now),
      this.opts.timing?.getFirstDayViews(24, now).catch(() => []) ?? Promise.resolve([]),
      own && this.opts.analytics
        ? this.opts.analytics.getAnalyticsVideos([channel.id], ANALYTICS_PERIOD).catch(() => [])
        : Promise.resolve([]),
    ]);

    const channelShorts = rankings.filter((r) => r.channelId === channel.id);
    const ranked = channelShorts.find((r) => r.id === id);
    const short = {
      id: video.id,
      channelId: video.channelId,
      title: video.title,
      publishedAt: video.publishedAt,
      thumbnailUrl: video.thumbnailUrl,
      durationSec: video.durationSec,
      views: video.views,
      views24h: ranked?.views24h ?? 0,
      views7d: ranked?.views7d ?? 0,
      likes: video.likes,
      comments: video.comments,
      removed: video.removedAt !== null,
      statsAt: video.statsAt,
    };
    const samples =
      buildTimingSamples({ ownChannelIds: [channel.id], ownShorts: channelShorts, rivalShorts: [], firstDay, now }).own.get(
        channel.id,
      ) ?? [];
    const analyticsRow = analyticsRows.find((r) => r.videoId === id);
    const comments = (await this.opts.comments?.getVideoComments(id, 20).catch(() => [])) ?? [];

    return {
      short,
      channel,
      isOwn: Boolean(own),
      rank: channelRank(ranked ? channelShorts : [...channelShorts, short], id),
      history,
      analytics: analyticsRow ? analyticsShortFrom(analyticsRow, short) : null,
      timing: shortTiming(id, video.publishedAt, samples),
      comments,
      historyHours: history.length >= 2 ? (history[history.length - 1].t - history[0].t) / HOUR_MS : 0,
      generatedAt: now,
    };
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
  ): Promise<{
    analytics: ChannelAnalytics[];
    dailyViews: Map<string, Map<string, number>>;
    views28d: Map<string, number>;
  } | null> {
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
      const views28d = new Map(videos.filter((v) => ids.includes(v.channelId)).map((v) => [v.videoId, v.views]));
      return { analytics, dailyViews, views28d };
    } catch (e) {
      console.error("[analytics] Lesen fehlgeschlagen:", e);
      return null;
    }
  }
}
