import type { ChannelConfig } from "@/config/channels";

/**
 * Die gemeinsame „Form“ aller Dashboard-Daten.
 * Jede Datenquelle (mock / youtube / database) liefert genau diese Form –
 * die Widgets müssen nicht wissen, woher die Zahlen kommen.
 */

export type DataSourceKind = "mock" | "youtube" | "database";

export type RankingPeriod = "24h" | "7d" | "all";

/** Ein Messpunkt im Verlauf eines Kanals (t = Zeitpunkt in Millisekunden). */
export interface ChannelPoint {
  t: number;
  views: number;
  subscribers: number;
  videoCount: number;
}

export interface ChannelTotals {
  subscribers: number;
  views: number;
  videoCount: number;
}

export interface ChannelDeltas {
  views: number;
  subscribers: number;
  videos: number;
}

export interface ChannelSummary {
  channel: ChannelConfig;
  /** Kanalbild von YouTube (null bei Beispieldaten). */
  avatarUrl: string | null;
  /** Stand beim letzten Schnappschuss. */
  current: ChannelTotals;
  /** true = YouTube zeigt die Abozahl öffentlich nur gerundet. */
  subscribersRounded: boolean;
  /** Gewinn in den letzten 24 Stunden (gleitend). */
  delta24h: ChannelDeltas;
  /** Gewinn in den 24 Stunden davor (für „besser/schlechter als Vortag“). */
  prevDelta24h: ChannelDeltas | null;
  /** Bester 24h-Gewinn im gespeicherten Verlauf (für „lila“ = Bestwert). */
  best24h: Pick<ChannelDeltas, "views" | "subscribers"> | null;
  /** Aktuelles Tempo – Grundlage der Hochrechnung zwischen Schnappschüssen. */
  rate: { viewsPerSecond: number };
  /** Verlauf der letzten 24h in 15-Minuten-Schritten. */
  history24h: ChannelPoint[];
  /** Verlauf der letzten 7 Tage in Stunden-Schritten. */
  history7d: ChannelPoint[];
}

export interface RankedShort {
  id: string;
  channelId: string;
  title: string;
  publishedAt: number;
  thumbnailUrl: string | null;
  durationSec: number;
  /** Aufrufe insgesamt. */
  views: number;
  views24h: number;
  views7d: number;
  likes: number;
}

export interface DashboardData {
  source: DataSourceKind;
  /** true = Beispieldaten, nicht echt. */
  isDemo: boolean;
  /**
   * true = es gibt einen Verlauf aus Schnappschüssen (24h-Werte, Kurven, Ranglisten 24h/7d).
   * false = nur der aktuelle Stand (YouTube direkt, bis die Datenbank aus Phase 3 läuft).
   */
  hasHistory: boolean;
  /** Zeitpunkt, an dem der Server diese Antwort erzeugt hat (ms). */
  generatedAt: number;
  /** Zeitpunkt des letzten Schnappschusses bzw. YouTube-Abrufs (ms). */
  lastSnapshotAt: number;
  /** Abstand bis zum nächsten Schnappschuss bzw. Abruf (Minuten). */
  snapshotIntervalMin: number;
  channels: ChannelSummary[];
  /**
   * Top-Shorts je Zeitraum. Enthält die besten N je Kanal (zusammengeführt),
   * damit das Widget auch nach Kanal filtern kann.
   */
  topShorts: Record<RankingPeriod, RankedShort[]>;
  quota: { usedToday: number | null; dailyLimit: number };
}

/** Jede Datenquelle muss diese eine Funktion anbieten. */
export interface DataSource {
  kind: DataSourceKind;
  getDashboard(now?: number): Promise<DashboardData>;
}
