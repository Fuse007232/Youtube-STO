import type { ChannelKind } from "@/config/channels";
import type { ChannelPoint, RankedShort } from "@/lib/data/types";

/**
 * Was die App von der Datenbank braucht – als Schnittstelle beschrieben.
 * Echte Umsetzung: SupabaseStore. Für Tests: MemoryStore.
 * So bleibt die Logik (Schnappschüsse, Dashboard) unabhängig von Supabase testbar.
 */

export interface ChannelRow {
  id: string;
  name: string;
  code: string;
  kind: ChannelKind;
  uploadsPlaylistId: string | null;
  avatarUrl: string | null;
}

export interface ChannelSnapshotRow {
  channelId: string;
  takenAt: number;
  subscribers: number;
  views: number;
  videoCount: number;
}

export interface VideoState {
  id: string;
  channelId: string;
  publishedAt: number | null;
  views: number;
  removed: boolean;
}

export interface VideoUpsert {
  id: string;
  channelId: string;
  title: string;
  publishedAt: number | null;
  thumbnailUrl: string | null;
  durationSec: number;
  views: number;
  likes: number;
  comments: number;
}

export interface VideoSnapshotRow {
  videoId: string;
  takenAt: number;
  views: number;
  likes: number;
  comments: number;
}

export type RunMode = "quick" | "full" | "compact";
export type RunTrigger = "cron" | "dashboard" | "manual";

export interface RunRow {
  id: number;
  startedAt: number;
  mode: RunMode;
  ok: boolean | null;
  units: number;
}

export interface RunFinish {
  at: number;
  units: number;
  videos: number;
  ok: boolean;
  error?: string;
}

/** Schreiben (Schnappschüsse). */
export interface SnapshotStore {
  upsertChannels(rows: ChannelRow[]): Promise<void>;
  insertChannelSnapshots(rows: ChannelSnapshotRow[]): Promise<void>;
  getVideoStates(channelIds: string[]): Promise<VideoState[]>;
  upsertVideos(rows: VideoUpsert[], statsAt: number): Promise<void>;
  insertVideoSnapshots(rows: VideoSnapshotRow[]): Promise<void>;
  markVideosRemoved(ids: string[], at: number): Promise<void>;
  startRun(mode: RunMode, trigger: RunTrigger, at: number): Promise<number>;
  finishRun(id: number, result: RunFinish): Promise<void>;
  recentRuns(since: number): Promise<RunRow[]>;
  compactVideoSnapshots(at: number): Promise<number>;
}

/** Lesen (Dashboard). */
export interface DashboardReader {
  getChannels(ids: string[]): Promise<ChannelRow[]>;
  getChannelPoints(channelId: string, since: number): Promise<ChannelPoint[]>;
  getVideoRankings(now: number): Promise<RankedShort[]>;
  recentRuns(since: number): Promise<RunRow[]>;
}
