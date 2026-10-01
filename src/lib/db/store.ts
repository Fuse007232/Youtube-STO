import type { ChannelKind } from "@/config/channels";
import type { AnalyticsDay, ChannelPoint, RankedShort } from "@/lib/data/types";

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
  /** Gesamtaufrufe laut YouTube-Kanalstatistik (hinkt oft Stunden hinterher). */
  views: number;
  videoCount: number;
  /** Summe der Aufrufe aller Shorts – deutlich aktueller, Grundlage für Gewinne und Kurven. */
  videoViews: number | null;
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

export type RunMode = "quick" | "full" | "compact" | "analytics";
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

export interface OAuthConnectionRow {
  channelId: string;
  refreshTokenEnc: string;
  scopes: string;
  connectedAt: number;
  lastUsedAt: number | null;
  lastError: string | null;
}

export interface AnalyticsVideoRow {
  videoId: string;
  channelId: string;
  views: number;
  minutesWatched: number;
  avgViewSec: number;
  avgViewPct: number;
  subsGained: number;
  likes: number;
  shares: number;
}

export type BreakdownKind = "traffic" | "country";

export interface BreakdownRow {
  channelId: string;
  kind: BreakdownKind;
  key: string;
  views: number;
  minutesWatched: number;
}

export interface AnalyticsDayRow extends AnalyticsDay {
  channelId: string;
}

/** Google-Verbindungen und Analytics-Daten (Phase 5). */
export interface AnalyticsStore {
  getConnections(): Promise<OAuthConnectionRow[]>;
  saveConnection(row: { channelId: string; refreshTokenEnc: string; scopes: string }): Promise<void>;
  deleteConnection(channelId: string): Promise<void>;
  updateConnectionStatus(channelId: string, status: { lastUsedAt?: number; lastError: string | null }): Promise<void>;
  upsertAnalyticsDaily(channelId: string, rows: AnalyticsDay[]): Promise<void>;
  replaceAnalyticsVideos(channelId: string, period: string, endDate: string, rows: AnalyticsVideoRow[]): Promise<void>;
  replaceBreakdowns(
    channelId: string,
    kind: BreakdownKind,
    period: string,
    endDate: string,
    rows: { key: string; views: number; minutesWatched: number }[],
  ): Promise<void>;
  getAnalyticsDaily(channelIds: string[], sinceDay: string): Promise<AnalyticsDayRow[]>;
  getAnalyticsVideos(channelIds: string[], period: string): Promise<AnalyticsVideoRow[]>;
  getBreakdowns(channelIds: string[], period: string): Promise<BreakdownRow[]>;
}

/** Lesen (Dashboard). */
export interface DashboardReader {
  getChannels(ids: string[]): Promise<ChannelRow[]>;
  getChannelPoints(channelId: string, since: number): Promise<ChannelPoint[]>;
  getVideoRankings(now: number): Promise<RankedShort[]>;
  recentRuns(since: number): Promise<RunRow[]>;
}
