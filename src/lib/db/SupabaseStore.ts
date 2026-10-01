import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsDay, ChannelPoint, RankedShort } from "@/lib/data/types";
import type {
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

export class SupabaseStore implements SnapshotStore, DashboardReader, AnalyticsStore {
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
      .select("id, name, code, kind, uploads_playlist_id, avatar_url")
      .in("id", ids);
    check(error, "Kanäle lesen");
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code ?? "",
      kind: r.kind,
      uploadsPlaylistId: r.uploads_playlist_id,
      avatarUrl: r.avatar_url,
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
}
