import type { AlertCandidate, HourRateRow } from "@/lib/alerts/detect";
import type { AlertItem, AnalyticsDay, ChannelPoint, RankedShort } from "@/lib/data/types";
import type {
  AlertStore,
  AnalyticsDayRow,
  AnalyticsStore,
  AnalyticsVideoRow,
  BreakdownKind,
  BreakdownRow,
  ChannelRow,
  OAuthConnectionRow,
  ChannelSnapshotRow,
  DashboardReader,
  RunFinish,
  RunMode,
  RunRow,
  RunTrigger,
  SnapshotStore,
  VideoSnapshotRow,
  VideoState,
  VideoUpsert,
} from "../store";

const DAY = 24 * 3_600_000;

/** Datenbank im Arbeitsspeicher – nur für Tests. Bildet die SQL-Logik nach. */
export class MemoryStore implements SnapshotStore, DashboardReader, AnalyticsStore, AlertStore {
  channels = new Map<string, ChannelRow>();
  channelSnapshots: ChannelSnapshotRow[] = [];
  videos = new Map<string, VideoUpsert & { statsAt: number; removedAt: number | null }>();
  videoSnapshots: VideoSnapshotRow[] = [];
  runs: (RunRow & { trigger: RunTrigger; finish?: RunFinish })[] = [];
  compactCalls = 0;
  alerts: AlertItem[] = [];
  connections = new Map<string, OAuthConnectionRow>();
  analyticsDaily = new Map<string, AnalyticsDayRow>();
  analyticsVideos: (AnalyticsVideoRow & { period: string })[] = [];
  breakdowns: (BreakdownRow & { period: string })[] = [];

  async upsertChannels(rows: ChannelRow[]) {
    rows.forEach((r) => this.channels.set(r.id, r));
  }
  async insertChannelSnapshots(rows: ChannelSnapshotRow[]) {
    this.channelSnapshots.push(...rows);
  }
  async getVideoStates(channelIds: string[]): Promise<VideoState[]> {
    return [...this.videos.values()]
      .filter((v) => channelIds.includes(v.channelId))
      .map((v) => ({
        id: v.id,
        channelId: v.channelId,
        publishedAt: v.publishedAt,
        views: v.views,
        removed: v.removedAt !== null,
      }));
  }
  async upsertVideos(rows: VideoUpsert[], statsAt: number) {
    rows.forEach((r) => this.videos.set(r.id, { ...r, statsAt, removedAt: null }));
  }
  async insertVideoSnapshots(rows: VideoSnapshotRow[]) {
    this.videoSnapshots.push(...rows);
  }
  async markVideosRemoved(ids: string[], at: number) {
    ids.forEach((id) => {
      const v = this.videos.get(id);
      if (v) v.removedAt = at;
    });
  }
  async startRun(mode: RunMode, trigger: RunTrigger, at: number) {
    const id = this.runs.length + 1;
    this.runs.push({ id, startedAt: at, mode, ok: null, units: 0, trigger });
    return id;
  }
  async finishRun(id: number, r: RunFinish) {
    const run = this.runs.find((x) => x.id === id)!;
    run.ok = r.ok;
    run.units = r.units;
    run.finish = r;
  }
  async recentRuns(since: number): Promise<RunRow[]> {
    return this.runs.filter((r) => r.startedAt >= since).sort((a, b) => b.startedAt - a.startedAt);
  }
  async compactVideoSnapshots() {
    this.compactCalls++;
    return 0;
  }

  async getChannels(ids: string[]) {
    return ids.map((id) => this.channels.get(id)).filter((c): c is ChannelRow => !!c);
  }
  async getChannelPoints(channelId: string, since: number): Promise<ChannelPoint[]> {
    return this.channelSnapshots
      .filter((s) => s.channelId === channelId && s.takenAt >= since)
      .sort((a, b) => a.takenAt - b.takenAt)
      .map((s) => ({
        t: s.takenAt,
        views: s.videoViews ?? s.views,
        subscribers: s.subscribers,
        videoCount: s.videoCount,
      }));
  }
  /** Gleiche Regeln wie die SQL-Funktion video_rankings. */
  async getVideoRankings(now: number): Promise<RankedShort[]> {
    return [...this.videos.values()]
      .filter((v) => v.removedAt === null)
      .map((v) => {
        const snaps = this.videoSnapshots
          .filter((s) => s.videoId === v.id)
          .sort((a, b) => a.takenAt - b.takenAt);
        const before = (t: number) => [...snaps].reverse().find((s) => s.takenAt <= t)?.views;
        const base = (windowMs: number) =>
          before(now - windowMs) ??
          (v.publishedAt !== null && v.publishedAt > now - windowMs ? 0 : undefined) ??
          snaps[0]?.views ??
          v.views;
        return {
          id: v.id,
          channelId: v.channelId,
          title: v.title,
          publishedAt: v.publishedAt ?? 0,
          thumbnailUrl: v.thumbnailUrl,
          durationSec: v.durationSec,
          views: v.views,
          likes: v.likes,
          views24h: Math.max(0, v.views - base(DAY)),
          views7d: Math.max(0, v.views - base(7 * DAY)),
        };
      });
  }

  // ───────────── Analytics ─────────────
  async getConnections() {
    return [...this.connections.values()];
  }
  async saveConnection(row: { channelId: string; refreshTokenEnc: string; scopes: string }) {
    this.connections.set(row.channelId, { ...row, connectedAt: Date.now(), lastUsedAt: null, lastError: null });
  }
  async deleteConnection(channelId: string) {
    this.connections.delete(channelId);
  }
  async updateConnectionStatus(channelId: string, status: { lastUsedAt?: number; lastError: string | null }) {
    const c = this.connections.get(channelId);
    if (!c) return;
    c.lastError = status.lastError;
    if (status.lastUsedAt) c.lastUsedAt = status.lastUsedAt;
  }
  async upsertAnalyticsDaily(channelId: string, rows: AnalyticsDay[]) {
    rows.forEach((r) => this.analyticsDaily.set(`${channelId}:${r.day}`, { ...r, channelId }));
  }
  async replaceAnalyticsVideos(channelId: string, period: string, _endDate: string, rows: AnalyticsVideoRow[]) {
    this.analyticsVideos = this.analyticsVideos.filter((v) => !(v.channelId === channelId && v.period === period));
    this.analyticsVideos.push(...rows.map((r) => ({ ...r, period })));
  }
  async replaceBreakdowns(
    channelId: string,
    kind: BreakdownKind,
    period: string,
    _endDate: string,
    rows: { key: string; views: number; minutesWatched: number }[],
  ) {
    this.breakdowns = this.breakdowns.filter((b) => !(b.channelId === channelId && b.kind === kind && b.period === period));
    this.breakdowns.push(...rows.map((r) => ({ ...r, channelId, kind, period })));
  }
  async getAnalyticsDaily(channelIds: string[], sinceDay: string) {
    return [...this.analyticsDaily.values()]
      .filter((d) => channelIds.includes(d.channelId) && d.day >= sinceDay)
      .sort((a, b) => a.day.localeCompare(b.day));
  }
  async getAnalyticsVideos(channelIds: string[], period: string) {
    return this.analyticsVideos.filter((v) => channelIds.includes(v.channelId) && v.period === period);
  }
  async getBreakdowns(channelIds: string[], period: string) {
    return this.breakdowns.filter((b) => channelIds.includes(b.channelId) && b.period === period);
  }

  // ───────────── Alarme ─────────────
  /** Gleiche Regeln wie die SQL-Funktion video_hour_rates. */
  async getVideoHourRates(now: number): Promise<HourRateRow[]> {
    return [...this.videos.values()]
      .filter((v) => v.removedAt === null)
      .map((v) => {
        const snaps = this.videoSnapshots.filter((s) => s.videoId === v.id).sort((a, b) => a.takenAt - b.takenAt);
        const at = (t: number) => [...snaps].reverse().find((s) => s.takenAt <= t)?.views ?? null;
        return {
          id: v.id,
          channelId: v.channelId,
          title: v.title,
          publishedAt: v.publishedAt,
          thumbnailUrl: v.thumbnailUrl,
          viewsNow: v.views,
          nowAt: v.statsAt,
          views1h: at(now - 3_600_000),
          views25h: at(now - 25 * 3_600_000),
        };
      });
  }
  async getRecentAlerts(since: number, limit = 50) {
    return this.alerts.filter((a) => a.detectedAt >= since).sort((a, b) => b.detectedAt - a.detectedAt).slice(0, limit);
  }
  async insertAlerts(rows: AlertCandidate[], at: number) {
    return rows.map((r) => {
      const id = this.alerts.length + 1;
      this.alerts.push({
        id, videoId: r.videoId, channelId: r.channelId, kind: r.kind, detectedAt: at, title: r.title,
        thumbnailUrl: r.thumbnailUrl, viewsLastHour: r.viewsLastHour, baselineHour: r.baselineHour,
        viewsTotal: r.viewsTotal, emailedAt: null, emailError: null,
      });
      return id;
    });
  }
  async markAlertsEmailed(ids: number[], at: number, error: string | null) {
    for (const a of this.alerts) {
      if (!ids.includes(a.id)) continue;
      if (error) a.emailError = error;
      else a.emailedAt = at;
    }
  }
}
