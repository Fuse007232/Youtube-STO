import type { ChannelPoint, RankedShort } from "@/lib/data/types";
import type {
  ChannelRow,
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
export class MemoryStore implements SnapshotStore, DashboardReader {
  channels = new Map<string, ChannelRow>();
  channelSnapshots: ChannelSnapshotRow[] = [];
  videos = new Map<string, VideoUpsert & { statsAt: number; removedAt: number | null }>();
  videoSnapshots: VideoSnapshotRow[] = [];
  runs: (RunRow & { trigger: RunTrigger; finish?: RunFinish })[] = [];
  compactCalls = 0;

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
}
