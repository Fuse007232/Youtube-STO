import type { ChannelConfig, ChannelKind } from "@/config/channels";
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
  /** Teamfarbe (Konkurrenten: aus der Palette vergeben). */
  color?: string | null;
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

export type RunMode = "quick" | "full" | "compact" | "analytics" | "comments";
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

/** „Short geht ab“-Alarme (Phase 6). */
export interface AlertStore {
  getVideoHourRates(now: number): Promise<HourRateRow[]>;
  /** Alarme seit `since`, neueste zuerst. */
  getRecentAlerts(since: number, limit?: number): Promise<AlertItem[]>;
  insertAlerts(rows: AlertCandidate[], at: number): Promise<number[]>;
  markAlertsEmailed(ids: number[], at: number, error: string | null): Promise<void>;
}

/** Konkurrenten verwalten (Phase 6.3). */
export interface CompetitorStore {
  /** Alle Konkurrenten (älteste zuerst). */
  getCompetitors(): Promise<ChannelConfig[]>;
  addCompetitor(row: { id: string; name: string; code: string; color: string; avatarUrl: string | null }): Promise<void>;
  /** Löscht den Konkurrenten samt Schnappschüssen und Videos. */
  removeCompetitor(id: string): Promise<void>;
}

/** Boxenstrategie: beste Upload-Uhrzeit (Phase 6.2). */
export interface TimingStore {
  /**
   * Aufrufe jedes Shorts nach `hours` Stunden – nur Shorts mit einem Messpunkt kurz
   * vor der Marke (SQL `video_first_day_views`; rechnet mit der Datenbank-Uhr).
   */
  getFirstDayViews(hours: number, now: number): Promise<FirstDayRow[]>;
  /** Aufrufe + gemessene Zeit je Tagesstunde (Berlin) und Kanal (SQL `channel_hourly_activity`). */
  getHourlyActivity(days: number, now: number): Promise<HourlyActivityRow[]>;
}

/** Ein Video mit neuestem Stand (Short-Steckbrief). */
export interface VideoRow {
  id: string;
  channelId: string;
  title: string;
  publishedAt: number | null;
  thumbnailUrl: string | null;
  durationSec: number;
  views: number;
  likes: number;
  comments: number;
  statsAt: number | null;
  removedAt: number | null;
}

/** Short-Steckbrief (Phase 7). */
export interface ShortStore {
  getVideo(id: string): Promise<VideoRow | null>;
  /** Alle gespeicherten Messpunkte eines Videos, aufsteigend. */
  getVideoHistory(id: string): Promise<ShortHistoryPoint[]>;
}

/** Kommentar-Puls (Phase 7). */
export interface CommentStore {
  /** Neu anlegen oder Likes/Antworten aktualisieren. */
  upsertComments(rows: CommentItem[], at: number): Promise<void>;
  /** Neueste Kommentare (neueste zuerst). */
  getRecentComments(channelIds: string[], limit: number): Promise<CommentItem[]>;
  /** Meistgelikte Kommentare, die seit `since` geschrieben wurden. */
  getTopComments(channelIds: string[], since: number, limit: number): Promise<CommentItem[]>;
  /** Kommentare eines Shorts (meistgelikte zuerst). */
  getVideoComments(videoId: string, limit: number): Promise<CommentItem[]>;
  /** Neue Kommentare je eigenem Short in 24 Std. (SQL `video_comment_gains`). */
  getCommentGains(now: number): Promise<CommentGainRow[]>;
}

export interface CommentGainRow {
  id: string;
  channelId: string;
  commentsNow: number;
  commentsBefore: number;
}

/** Lesen (Dashboard). */
export interface DashboardReader {
  getChannels(ids: string[]): Promise<ChannelRow[]>;
  getChannelPoints(channelId: string, since: number): Promise<ChannelPoint[]>;
  getVideoRankings(now: number): Promise<RankedShort[]>;
  recentRuns(since: number): Promise<RunRow[]>;
}
