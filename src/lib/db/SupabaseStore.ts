import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertCandidate, HourRateRow } from "@/lib/alerts/detect";
import type {
  AlertItem,
  AnalyticsDay,
  ChannelPoint,
  CommentItem,
  RankedShort,
  ShortHistoryPoint,
} from "@/lib/data/types";
import type { FirstDayRow, HourlyActivityRow } from "@/lib/metrics/upload-timing";
import type { ChannelConfig } from "@/config/channels";
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
  CommentGainRow,
  CommentStore,
  CompetitorStore,
  DashboardReader,
  RunFinish,
  RunMode,
  RunRow,
  RunTrigger,
  ShortStore,
  SnapshotStore,
  TimingStore,
  VideoRow,
  VideoSnapshotRow,
  VideoState,
  VideoUpsert,
} from "./store";

/** Supabase liefert pro Abfrage höchstens 1000 Zeilen → in Seiten holen. */
const PAGE = 1000;
/** Große Schreibvorgänge in Pakete teilen. */
const WRITE_BATCH = 500;

const iso = (t: number) => new Date(t).toISOString();
const ms = (s: string | null) => (s ? Date.parse(s) : null);

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`Datenbank-Fehler (${what}): ${error.message}`);
}

async function inBatches<T>(rows: T[], fn: (batch: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < rows.length; i += WRITE_BATCH) await fn(rows.slice(i, i + WRITE_BATCH));
}

export class SupabaseStore
  implements SnapshotStore, DashboardReader, AnalyticsStore, AlertStore, CompetitorStore, TimingStore, ShortStore, CommentStore
{
  constructor(private readonly db: SupabaseClient) {}

  // ───────────── Schreiben ─────────────

  async upsertChannels(rows: ChannelRow[]) {
    const { error } = await this.db.from("channels").upsert(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        code: r.code,
        kind: r.kind,
        uploads_playlist_id: r.uploadsPlaylistId,
        avatar_url: r.avatarUrl,
        ...(r.color ? { color: r.color } : {}),
        updated_at: new Date().toISOString(),
      })),
    );
    check(error, "Kanäle speichern");
  }

  async insertChannelSnapshots(rows: ChannelSnapshotRow[]) {
    const { error } = await this.db.from("channel_snapshots").upsert(
      rows.map((r) => ({
        channel_id: r.channelId,
        taken_at: iso(r.takenAt),
        subscribers: r.subscribers,
        views: r.views,
        video_count: r.videoCount,
        video_views: r.videoViews,
      })),
      { ignoreDuplicates: true },
    );
    check(error, "Kanal-Schnappschüsse speichern");
  }

  async getVideoStates(channelIds: string[]): Promise<VideoState[]> {
    const out: VideoState[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .from("videos")
        .select("id, channel_id, published_at, views, removed_at")
        .in("channel_id", channelIds)
        .order("id")
        .range(from, from + PAGE - 1);
      check(error, "Videos lesen");
      for (const r of data ?? []) {
        out.push({
          id: r.id,
          channelId: r.channel_id,
          publishedAt: ms(r.published_at),
          views: Number(r.views),
          removed: r.removed_at !== null,
        });
      }
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async upsertVideos(rows: VideoUpsert[], statsAt: number) {
    await inBatches(rows, async (batch) => {
      const { error } = await this.db.from("videos").upsert(
        batch.map((r) => ({
          id: r.id,
          channel_id: r.channelId,
          title: r.title,
          published_at: r.publishedAt === null ? null : iso(r.publishedAt),
          thumbnail_url: r.thumbnailUrl,
          duration_sec: r.durationSec,
          views: r.views,
          likes: r.likes,
          comments: r.comments,
          stats_updated_at: iso(statsAt),
          removed_at: null,
        })),
      );
      check(error, "Videos speichern");
    });
  }

  async insertVideoSnapshots(rows: VideoSnapshotRow[]) {
    await inBatches(rows, async (batch) => {
      const { error } = await this.db.from("video_snapshots").upsert(
        batch.map((r) => ({
          video_id: r.videoId,
          taken_at: iso(r.takenAt),
          views: r.views,
          likes: r.likes,
          comments: r.comments,
        })),
        { ignoreDuplicates: true },
      );
      check(error, "Video-Schnappschüsse speichern");
    });
  }

  async markVideosRemoved(ids: string[], at: number) {
    if (ids.length === 0) return;
    const { error } = await this.db.from("videos").update({ removed_at: iso(at) }).in("id", ids);
    check(error, "entfernte Videos markieren");
  }

  async startRun(mode: RunMode, trigger: RunTrigger, at: number): Promise<number> {
    const { data, error } = await this.db
      .from("snapshot_runs")
      .insert({ mode, trigger, started_at: iso(at) })
      .select("id")
      .single();
    check(error, "Lauf starten");
    return Number(data!.id);
  }

  async finishRun(id: number, r: RunFinish) {
    const { error } = await this.db
      .from("snapshot_runs")
      .update({ finished_at: iso(r.at), units: r.units, videos: r.videos, ok: r.ok, error: r.error ?? null })
      .eq("id", id);
    check(error, "Lauf abschließen");
  }

  async recentRuns(since: number): Promise<RunRow[]> {
    const { data, error } = await this.db
      .from("snapshot_runs")
      .select("id, started_at, mode, ok, units")
      .gte("started_at", iso(since))
      .order("started_at", { ascending: false })
      .limit(PAGE);
    check(error, "Läufe lesen");
    return (data ?? []).map((r) => ({
      id: Number(r.id),
      startedAt: Date.parse(r.started_at),
      mode: r.mode,
      ok: r.ok,
      units: Number(r.units),
    }));
  }

  async compactVideoSnapshots(at: number): Promise<number> {
    const { data, error } = await this.db.rpc("compact_video_snapshots", { p_now: iso(at) });
    check(error, "Verdichten");
    return Number(data ?? 0);
  }

  // ───────────── Lesen ─────────────

  async getChannels(ids: string[]): Promise<ChannelRow[]> {
    const { data, error } = await this.db
      .from("channels")
      .select("id, name, code, kind, uploads_playlist_id, avatar_url, color")
      .in("id", ids);
    check(error, "Kanäle lesen");
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code ?? "",
      kind: r.kind,
      uploadsPlaylistId: r.uploads_playlist_id,
      avatarUrl: r.avatar_url,
      color: r.color,
    }));
  }

  async getChannelPoints(channelId: string, since: number): Promise<ChannelPoint[]> {
    const out: ChannelPoint[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .from("channel_snapshots")
        .select("taken_at, subscribers, views, video_count, video_views")
        .eq("channel_id", channelId)
        .gte("taken_at", iso(since))
        .order("taken_at", { ascending: true })
        .range(from, from + PAGE - 1);
      check(error, "Kanal-Verlauf lesen");
      for (const r of data ?? []) {
        out.push({
          t: Date.parse(r.taken_at),
          subscribers: Number(r.subscribers),
          // Summe der Short-Aufrufe bevorzugen (aktueller als die Kanalstatistik).
          views: Number(r.video_views ?? r.views),
          videoCount: Number(r.video_count),
        });
      }
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async getVideoRankings(now: number): Promise<RankedShort[]> {
    const out: RankedShort[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .rpc("video_rankings", { p_now: iso(now) })
        .order("id")
        .range(from, from + PAGE - 1);
      check(error, "Rangliste lesen");
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        out.push({
          id: String(r.id),
          channelId: String(r.channel_id),
          title: String(r.title ?? ""),
          publishedAt: ms((r.published_at as string | null) ?? null) ?? 0,
          thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
          durationSec: Number(r.duration_sec ?? 0),
          views: Number(r.views ?? 0),
          likes: Number(r.likes ?? 0),
          views24h: Number(r.views_24h ?? 0),
          views7d: Number(r.views_7d ?? 0),
        });
      }
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  // ───────────── Analytics (Phase 5) ─────────────

  async getConnections(): Promise<OAuthConnectionRow[]> {
    const { data, error } = await this.db
      .from("oauth_connections")
      .select("channel_id, refresh_token_enc, scopes, connected_at, last_used_at, last_error");
    check(error, "Verbindungen lesen");
    return (data ?? []).map((r) => ({
      channelId: r.channel_id,
      refreshTokenEnc: r.refresh_token_enc,
      scopes: r.scopes,
      connectedAt: Date.parse(r.connected_at),
      lastUsedAt: ms(r.last_used_at),
      lastError: r.last_error,
    }));
  }

  async saveConnection(row: { channelId: string; refreshTokenEnc: string; scopes: string }) {
    const { error } = await this.db.from("oauth_connections").upsert({
      channel_id: row.channelId,
      refresh_token_enc: row.refreshTokenEnc,
      scopes: row.scopes,
      connected_at: new Date().toISOString(),
      last_error: null,
    });
    check(error, "Verbindung speichern");
  }

  async deleteConnection(channelId: string) {
    const { error } = await this.db.from("oauth_connections").delete().eq("channel_id", channelId);
    check(error, "Verbindung löschen");
  }

  async updateConnectionStatus(channelId: string, status: { lastUsedAt?: number; lastError: string | null }) {
    const patch: Record<string, unknown> = { last_error: status.lastError };
    if (status.lastUsedAt) patch.last_used_at = iso(status.lastUsedAt);
    const { error } = await this.db.from("oauth_connections").update(patch).eq("channel_id", channelId);
    check(error, "Verbindungsstatus speichern");
  }

  async upsertAnalyticsDaily(channelId: string, rows: AnalyticsDay[]) {
    if (rows.length === 0) return;
    const { error } = await this.db.from("analytics_daily").upsert(
      rows.map((r) => ({
        channel_id: channelId,
        day: r.day,
        views: r.views,
        engaged_views: r.engagedViews,
        minutes_watched: r.minutesWatched,
        avg_view_sec: r.avgViewSec,
        avg_view_pct: r.avgViewPct,
        subs_gained: r.subsGained,
        subs_lost: r.subsLost,
        likes: r.likes,
        shares: r.shares,
        comments: r.comments,
        fetched_at: new Date().toISOString(),
      })),
    );
    check(error, "Analytics-Tage speichern");
  }

  async replaceAnalyticsVideos(channelId: string, period: string, endDate: string, rows: AnalyticsVideoRow[]) {
    const del = await this.db.from("analytics_videos").delete().eq("channel_id", channelId).eq("period", period);
    check(del.error, "Analytics-Shorts leeren");
    await inBatches(rows, async (batch) => {
      const { error } = await this.db.from("analytics_videos").upsert(
        batch.map((r) => ({
          video_id: r.videoId,
          channel_id: channelId,
          period,
          end_date: endDate,
          views: r.views,
          minutes_watched: r.minutesWatched,
          avg_view_sec: r.avgViewSec,
          avg_view_pct: r.avgViewPct,
          subs_gained: r.subsGained,
          likes: r.likes,
          shares: r.shares,
        })),
      );
      check(error, "Analytics-Shorts speichern");
    });
  }

  async replaceBreakdowns(
    channelId: string,
    kind: BreakdownKind,
    period: string,
    endDate: string,
    rows: { key: string; views: number; minutesWatched: number }[],
  ) {
    const del = await this.db
      .from("analytics_breakdowns")
      .delete()
      .eq("channel_id", channelId)
      .eq("kind", kind)
      .eq("period", period);
    check(del.error, "Aufschlüsselung leeren");
    if (rows.length === 0) return;
    const { error } = await this.db.from("analytics_breakdowns").upsert(
      rows.map((r) => ({
        channel_id: channelId,
        kind,
        key: r.key,
        period,
        end_date: endDate,
        views: r.views,
        minutes_watched: r.minutesWatched,
      })),
    );
    check(error, "Aufschlüsselung speichern");
  }

  async getAnalyticsDaily(channelIds: string[], sinceDay: string): Promise<AnalyticsDayRow[]> {
    const { data, error } = await this.db
      .from("analytics_daily")
      .select("*")
      .in("channel_id", channelIds)
      .gte("day", sinceDay)
      .order("day", { ascending: true })
      .limit(PAGE);
    check(error, "Analytics-Tage lesen");
    return (data ?? []).map((r) => ({
      channelId: r.channel_id,
      day: r.day,
      views: Number(r.views),
      engagedViews: r.engaged_views === null ? null : Number(r.engaged_views),
      minutesWatched: Number(r.minutes_watched),
      avgViewSec: Number(r.avg_view_sec),
      avgViewPct: Number(r.avg_view_pct),
      subsGained: Number(r.subs_gained),
      subsLost: Number(r.subs_lost),
      likes: Number(r.likes),
      shares: Number(r.shares),
      comments: Number(r.comments),
    }));
  }

  async getAnalyticsVideos(channelIds: string[], period: string): Promise<AnalyticsVideoRow[]> {
    const { data, error } = await this.db
      .from("analytics_videos")
      .select("*")
      .in("channel_id", channelIds)
      .eq("period", period)
      .limit(PAGE);
    check(error, "Analytics-Shorts lesen");
    return (data ?? []).map((r) => ({
      videoId: r.video_id,
      channelId: r.channel_id,
      views: Number(r.views),
      minutesWatched: Number(r.minutes_watched),
      avgViewSec: Number(r.avg_view_sec),
      avgViewPct: Number(r.avg_view_pct),
      subsGained: Number(r.subs_gained),
      likes: Number(r.likes),
      shares: Number(r.shares),
    }));
  }

  async getBreakdowns(channelIds: string[], period: string): Promise<BreakdownRow[]> {
    const { data, error } = await this.db
      .from("analytics_breakdowns")
      .select("channel_id, kind, key, views, minutes_watched")
      .in("channel_id", channelIds)
      .eq("period", period)
      .limit(PAGE);
    check(error, "Aufschlüsselungen lesen");
    return (data ?? []).map((r) => ({
      channelId: r.channel_id,
      kind: r.kind,
      key: r.key,
      views: Number(r.views),
      minutesWatched: Number(r.minutes_watched),
    }));
  }

  // ───────────── Alarme (Phase 6) ─────────────

  async getVideoHourRates(now: number): Promise<HourRateRow[]> {
    const out: HourRateRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .rpc("video_hour_rates", { p_now: iso(now) })
        .order("id")
        .range(from, from + PAGE - 1);
      check(error, "Stundenwerte lesen");
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        out.push({
          id: String(r.id),
          channelId: String(r.channel_id),
          title: String(r.title ?? ""),
          publishedAt: ms((r.published_at as string | null) ?? null),
          thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
          viewsNow: Number(r.views_now ?? 0),
          nowAt: ms((r.now_at as string | null) ?? null) ?? now,
          views1h: r.views_1h === null || r.views_1h === undefined ? null : Number(r.views_1h),
          views25h: r.views_25h === null || r.views_25h === undefined ? null : Number(r.views_25h),
        });
      }
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async getRecentAlerts(since: number, limit = 50): Promise<AlertItem[]> {
    const { data, error } = await this.db
      .from("alerts")
      .select("id, video_id, channel_id, kind, detected_at, views_last_hour, baseline_hour, views_total, emailed_at, email_error, videos(title, thumbnail_url)")
      .gte("detected_at", iso(since))
      .order("detected_at", { ascending: false })
      .limit(limit);
    check(error, "Alarme lesen");
    return (data ?? []).map((r) => {
      const v = (Array.isArray(r.videos) ? r.videos[0] : r.videos) as { title?: string; thumbnail_url?: string | null } | null;
      return {
        id: Number(r.id),
        videoId: r.video_id,
        channelId: r.channel_id,
        kind: r.kind,
        detectedAt: Date.parse(r.detected_at),
        title: v?.title ?? "",
        thumbnailUrl: v?.thumbnail_url ?? null,
        viewsLastHour: Number(r.views_last_hour),
        baselineHour: r.baseline_hour === null ? null : Number(r.baseline_hour),
        viewsTotal: Number(r.views_total),
        emailedAt: ms(r.emailed_at),
        emailError: r.email_error,
      };
    });
  }

  async insertAlerts(rows: AlertCandidate[], at: number): Promise<number[]> {
    if (rows.length === 0) return [];
    const { data, error } = await this.db
      .from("alerts")
      .insert(
        rows.map((r) => ({
          video_id: r.videoId,
          channel_id: r.channelId,
          kind: r.kind,
          detected_at: iso(at),
          views_last_hour: r.viewsLastHour,
          baseline_hour: r.baselineHour,
          views_total: r.viewsTotal,
        })),
      )
      .select("id");
    check(error, "Alarme speichern");
    return (data ?? []).map((r) => Number(r.id));
  }

  async markAlertsEmailed(ids: number[], at: number, error: string | null) {
    if (ids.length === 0) return;
    const patch = error ? { email_error: error } : { emailed_at: iso(at), email_error: null };
    const res = await this.db.from("alerts").update(patch).in("id", ids);
    check(res.error, "Alarm-Versand vermerken");
  }

  // ───────────── Konkurrenten (Phase 6.3) ─────────────

  async getCompetitors(): Promise<ChannelConfig[]> {
    const { data, error } = await this.db
      .from("channels")
      .select("id, name, code, color")
      .eq("kind", "competitor")
      .order("created_at", { ascending: true });
    check(error, "Konkurrenten lesen");
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code ?? r.name.slice(0, 3).toUpperCase(),
      color: r.color ?? "#8b8a96",
      kind: "competitor" as const,
    }));
  }

  async addCompetitor(row: { id: string; name: string; code: string; color: string; avatarUrl: string | null }) {
    const { error } = await this.db.from("channels").upsert({
      id: row.id,
      name: row.name,
      code: row.code,
      color: row.color,
      kind: "competitor",
      avatar_url: row.avatarUrl,
      updated_at: new Date().toISOString(),
    });
    check(error, "Konkurrent speichern");
  }

  async removeCompetitor(id: string) {
    const { error } = await this.db.from("channels").delete().eq("id", id).eq("kind", "competitor");
    check(error, "Konkurrent entfernen");
  }

  // ───────────── Boxenstrategie (Phase 6.2) ─────────────

  async getFirstDayViews(hours: number): Promise<FirstDayRow[]> {
    const out: FirstDayRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .rpc("video_first_day_views", { p_hours: hours })
        .order("id")
        .range(from, from + PAGE - 1);
      check(error, "Startkurven lesen");
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const publishedAt = ms((r.published_at as string | null) ?? null);
        if (publishedAt === null) continue;
        out.push({
          id: String(r.id),
          channelId: String(r.channel_id),
          publishedAt,
          viewsAt: Number(r.views_at ?? 0),
        });
      }
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async getHourlyActivity(days: number): Promise<HourlyActivityRow[]> {
    const { data, error } = await this.db.rpc("channel_hourly_activity", { p_days: days });
    check(error, "Tagesrhythmus lesen");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      channelId: String(r.channel_id),
      hour: Number(r.hour),
      views: Number(r.views ?? 0),
      hours: Number(r.hours ?? 0),
    }));
  }

  // ───────────── Short-Steckbrief (Phase 7) ─────────────

  async getVideo(id: string): Promise<VideoRow | null> {
    const { data, error } = await this.db
      .from("videos")
      .select("id, channel_id, title, published_at, thumbnail_url, duration_sec, views, likes, comments, stats_updated_at, removed_at")
      .eq("id", id)
      .maybeSingle();
    check(error, "Video lesen");
    if (!data) return null;
    return {
      id: data.id,
      channelId: data.channel_id,
      title: data.title ?? "",
      publishedAt: ms(data.published_at),
      thumbnailUrl: data.thumbnail_url,
      durationSec: Number(data.duration_sec ?? 0),
      views: Number(data.views ?? 0),
      likes: Number(data.likes ?? 0),
      comments: Number(data.comments ?? 0),
      statsAt: ms(data.stats_updated_at),
      removedAt: ms(data.removed_at),
    };
  }

  async getVideoHistory(id: string): Promise<ShortHistoryPoint[]> {
    const out: ShortHistoryPoint[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.db
        .from("video_snapshots")
        .select("taken_at, views, likes, comments")
        .eq("video_id", id)
        .order("taken_at")
        .range(from, from + PAGE - 1);
      check(error, "Video-Verlauf lesen");
      for (const r of data ?? []) {
        out.push({
          t: Date.parse(r.taken_at),
          views: Number(r.views),
          likes: r.likes === null ? null : Number(r.likes),
          comments: r.comments === null ? null : Number(r.comments),
        });
      }
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  // ───────────── Kommentar-Puls (Phase 7) ─────────────

  async upsertComments(rows: CommentItem[], at: number): Promise<void> {
    // Doppelte IDs in einem Paket mag Postgres nicht → vorher zusammenfassen
    const unique = [...new Map(rows.map((r) => [r.id, r])).values()];
    await inBatches(unique, async (batch) => {
      const { error } = await this.db.from("comments").upsert(
        batch.map((c) => ({
          id: c.id,
          video_id: c.videoId,
          channel_id: c.channelId,
          author: c.author,
          text: c.text,
          likes: c.likes,
          replies: c.replies,
          published_at: iso(c.publishedAt),
          fetched_at: iso(at),
        })),
      );
      check(error, "Kommentare speichern");
    });
  }

  private static readonly COMMENT_FIELDS = "id, video_id, channel_id, author, text, likes, replies, published_at";

  private static toComment(r: Record<string, unknown>): CommentItem {
    return {
      id: String(r.id),
      videoId: String(r.video_id),
      channelId: String(r.channel_id),
      author: String(r.author ?? ""),
      text: String(r.text ?? ""),
      likes: Number(r.likes ?? 0),
      replies: Number(r.replies ?? 0),
      publishedAt: Date.parse(String(r.published_at)),
    };
  }

  async getRecentComments(channelIds: string[], limit: number): Promise<CommentItem[]> {
    const { data, error } = await this.db
      .from("comments")
      .select(SupabaseStore.COMMENT_FIELDS)
      .in("channel_id", channelIds)
      .order("published_at", { ascending: false })
      .limit(limit);
    check(error, "Kommentare lesen");
    return (data ?? []).map((r) => SupabaseStore.toComment(r));
  }

  async getTopComments(channelIds: string[], since: number, limit: number): Promise<CommentItem[]> {
    const { data, error } = await this.db
      .from("comments")
      .select(SupabaseStore.COMMENT_FIELDS)
      .in("channel_id", channelIds)
      .gte("published_at", iso(since))
      .order("likes", { ascending: false })
      .limit(limit);
    check(error, "Kommentare lesen");
    return (data ?? []).map((r) => SupabaseStore.toComment(r));
  }

  async getVideoComments(videoId: string, limit: number): Promise<CommentItem[]> {
    const { data, error } = await this.db
      .from("comments")
      .select(SupabaseStore.COMMENT_FIELDS)
      .eq("video_id", videoId)
      .order("likes", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(limit);
    check(error, "Kommentare lesen");
    return (data ?? []).map((r) => SupabaseStore.toComment(r));
  }

  async getCommentGains(now: number): Promise<CommentGainRow[]> {
    const { data, error } = await this.db.rpc("video_comment_gains", { p_now: iso(now) });
    check(error, "Kommentar-Zuwachs lesen");
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      channelId: String(r.channel_id),
      commentsNow: Number(r.comments_now ?? 0),
      commentsBefore: Number(r.comments_before ?? 0),
    }));
  }
}
