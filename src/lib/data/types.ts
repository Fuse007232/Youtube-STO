import type { ChannelConfig } from "@/config/channels";

/**
 * Die gemeinsame „Form“ aller Dashboard-Daten.
 * Jede Datenquelle (mock / youtube / database) liefert genau diese Form –
 * die Widgets müssen nicht wissen, woher die Zahlen kommen.
 */

export type DataSourceKind = "mock" | "youtube" | "database";

export type RankingPeriod = "24h" | "7d" | "28d" | "all";
/** Globaler Zeitraum-Schalter (Phase 8) – gleiche Werte wie die Ranglisten. */
export type TimeRange = RankingPeriod;

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
  /** Aufrufe der letzten 28 Tage laut YouTube Analytics (nur eigene Kanäle, Top 200; sonst null/fehlt). */
  views28d?: number | null;
  likes: number;
}

/** Ein Tag YouTube Analytics (exakte Werte, 1–2 Tage Verzögerung). */
export interface AnalyticsDay {
  day: string; // YYYY-MM-DD (pazifische Zeit)
  views: number;
  /** Shorts-Aufrufe ohne Wiederholungen (null, falls YouTube die Kennzahl nicht liefert). */
  engagedViews: number | null;
  minutesWatched: number;
  avgViewSec: number;
  avgViewPct: number;
  subsGained: number;
  subsLost: number;
  likes: number;
  shares: number;
  comments: number;
}

export interface AnalyticsTotals {
  days: number;
  views: number;
  engagedViews: number | null;
  minutesWatched: number;
  avgViewSec: number;
  avgViewPct: number;
  subsGained: number;
  subsLost: number;
  subsNet: number;
  likes: number;
  shares: number;
  comments: number;
}

/** Ein Short mit Analytics-Werten der letzten 28 Tage. */
export interface AnalyticsShort {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: number | null;
  views: number;
  minutesWatched: number;
  avgViewSec: number;
  avgViewPct: number;
  subsGained: number;
  /** Neue Abos pro 1.000 Aufrufe. */
  subsPer1k: number;
  likes: number;
  shares: number;
}

export interface BreakdownItem {
  key: string;
  label: string;
  views: number;
  /** Anteil 0…1 */
  share: number;
}

export interface ChannelAnalytics {
  channelId: string;
  /** Kanal ist per Google-Login verbunden. */
  connected: boolean;
  /** Letzter Fehler (z. B. „Erlaubnis abgelaufen“). */
  error: string | null;
  /** Neuester Tag mit Daten (YYYY-MM-DD). */
  lastDay: string | null;
  /** Tageswerte, aufsteigend (bis zu 40 Tage). */
  daily: AnalyticsDay[];
  /** Summen/Mittelwerte der letzten 28 Tage mit Daten. */
  totals28d: AnalyticsTotals | null;
  /** Shorts der letzten 28 Tage (nach neuen Abos sortiert). */
  shorts: AnalyticsShort[];
  traffic: BreakdownItem[];
  countries: BreakdownItem[];
}

/** Ein „Short geht ab“-Alarm (Phase 6). */
export interface AlertItem {
  id: number;
  videoId: string;
  channelId: string;
  kind: "rocket" | "breakout";
  detectedAt: number;
  title: string;
  thumbnailUrl: string | null;
  viewsLastHour: number;
  baselineHour: number | null;
  viewsTotal: number;
  emailedAt: number | null;
  emailError: string | null;
}

/** Eine Zeile der „Fahrerwertung“ (eigene Kanäle + Konkurrenten, Phase 6.3). */
export interface StandingsEntry {
  summary: ChannelSummary;
  isOwn: boolean;
  /** Shorts, die in den letzten 7 Tagen hochgeladen wurden. */
  uploads7d: number;
  /** Ø Aufrufe der Shorts, die in den letzten 30 Tagen hochgeladen wurden (null = keine). */
  avgViewsPerShort30d: number | null;
  /** Bester Short nach Aufrufen in 24h. */
  bestShort24h: Pick<RankedShort, "id" | "title" | "views24h" | "thumbnailUrl"> | null;
}

// ───────────── Analyse-Seite (Phase 7) ─────────────

/** Leistung nach Short-Länge („Renndistanz“). */
export interface LengthBucket {
  label: string;
  minSec: number;
  /** null = nach oben offen. */
  maxSec: number | null;
  stat: SlotStat;
}

export interface LengthAnalysis {
  /** Kanal-ID oder "competitors". */
  scope: string;
  samples: number;
  buckets: LengthBucket[];
  /** Index des besten getesteten Bereichs (null = zu wenig Daten). */
  best: number | null;
  /** Index des am häufigsten genutzten Bereichs. */
  common: number | null;
  /** Vorteil des besten gegenüber dem häufigsten Bereich in Prozent. */
  upliftPct: number | null;
  confidence: TimingConfidence;
}

/** Aufrufe eines Zeitfensters nach Alter der Shorts („Reifenverschleiß“). */
export interface CatalogWindow {
  totalViews: number;
  buckets: { label: string; views: number; share: number; shorts: number }[];
  /** Anteil der Shorts, die älter als 7 Tage sind (0…1). */
  catalogShare: number;
}

export interface CatalogAnalysis {
  channelId: string;
  window24h: CatalogWindow;
  window7d: CatalogWindow;
  /** Alte Shorts (> 30 Tage), die in 24 Std. am meisten holen. */
  evergreens: Pick<RankedShort, "id" | "title" | "thumbnailUrl" | "views" | "views24h" | "publishedAt">[];
}

/** Ein Tag im Upload-Kalender (Berliner Datum). */
export interface CalendarDay {
  day: string;
  uploads: number;
  /** Aufrufe des Tages laut YouTube Analytics (null = keine Daten). */
  views: number | null;
}

export interface UploadCalendar {
  channelId: string;
  /** Lückenlos von einem Montag bis heute. */
  days: CalendarDay[];
  /** Tage in Folge mit mindestens einem Upload (bis heute bzw. gestern). */
  currentStreak: number;
  longestStreak: number;
  /** Neuester Tag mit Analytics-Aufrufen (YYYY-MM-DD) oder null. */
  viewsUntil: string | null;
}

// ───────────── Boxenstrategie (beste Upload-Uhrzeit, Phase 6.2) ─────────────

export type SampleSource = "history" | "first24h";

export interface SlotStat {
  n: number;
  /** Geschrumpfter geometrischer Mittelwert des Index (1 = normal). */
  score: number;
  /** Median der Index-Werte (null bei 0 Shorts). */
  median: number | null;
  /** Standardfehler im log-Maßstab (null bei < 2 Shorts). */
  se: number | null;
  /** Ungeschrumpfter log-Mittelwert (für Vergleiche). */
  meanLog: number;
}

export type TimingConfidence = "deutlich" | "tendenz" | "unsicher";

export interface TimingRecommendation {
  /** Bester getesteter 2-Std.-Block (0 = 0–2 Uhr … 11 = 22–24 Uhr). */
  block: number;
  /** Dein Standard-Block (am häufigsten genutzt). */
  defaultBlock: number;
  /** Anteil deiner Uploads im Standard-Block (0…1). */
  defaultShare: number;
  /** Vorteil gegenüber dem Standard in Prozent (0 = Standard ist schon am besten). */
  upliftPct: number;
  confidence: TimingConfidence;
  /** Bester Wochentag (0 = Mo) – nur wenn er sich wirklich abhebt, sonst null. */
  weekday: number | null;
  weekdayUpliftPct: number | null;
}

export interface TimingExperiment {
  block: number;
  reason: "audience" | "competition";
  /** Publikum: Anteil an der Spitzen-Aktivität (0…1); Konkurrenz: deren Index. */
  value: number;
}

export interface TimingRecent {
  videoId: string;
  title: string;
  publishedAt: number;
  index: number | null;
  source: SampleSource | null;
}

export interface TimingAnalysis {
  /** Kanal-ID oder "competitors" (alle Konkurrenten zusammen). */
  scope: string;
  samples: number;
  samplesFirst24h: number;
  /** [Wochentag 0=Mo … 6=So][Block 0…11] */
  cells: SlotStat[][];
  byBlock: SlotStat[];
  byWeekday: SlotStat[];
  /** Ø Aufrufe pro Stunde je Tagesstunde (Berlin, 0…23); null = noch zu wenig Verlauf. */
  activity: number[] | null;
  /** Wie viele Stunden Aktivitäts-Daten es gibt. */
  activityHours: number;
  recommendation: TimingRecommendation | null;
  experiments: TimingExperiment[];
  recent: TimingRecent[];
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
  /**
   * Wie viele Stunden Verlauf es gibt (kürzester Kanal). Unter 24 heißt:
   * „24h“-Werte gelten erst „seit Messbeginn“ – die Widgets beschriften das entsprechend.
   */
  historyHours: number;
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
  /**
   * YouTube Analytics je Kanal (Phase 5). null = diese Datenquelle hat keine
   * Analytics (z. B. YouTube direkt) → Analytics-Widgets blenden sich aus.
   */
  analytics: ChannelAnalytics[] | null;
  /** Letzte Alarme (neueste zuerst). null = Quelle ohne Alarme. */
  alerts: AlertItem[] | null;
  /**
   * Fahrerwertung: eigene Kanäle + Konkurrenten. null = Quelle ohne Konkurrenz-Daten.
   * Ohne eingetragene Konkurrenten stehen hier nur die eigenen Kanäle.
   */
  standings: StandingsEntry[] | null;
  /**
   * Boxenstrategie: je eigener Kanal eine Auswertung (+ „competitors“ = alle Konkurrenten
   * zusammen, falls eingetragen). null = Quelle ohne diese Auswertung.
   */
  uploadTiming: TimingAnalysis[] | null;
  /** Beste Short-Länge je eigener Kanal (+ „competitors“). null = Quelle ohne Shorts-Liste. */
  shortLength: LengthAnalysis[] | null;
  /** Langzeit-Anteil je eigenem Kanal. null = Quelle ohne Verlauf. */
  catalog: CatalogAnalysis[] | null;
  /** Upload-Kalender je eigenem Kanal. */
  calendar: UploadCalendar[] | null;
  /** Kommentar-Puls der eigenen Kanäle. null = Quelle ohne Kommentare. */
  comments: CommentPulse | null;
  /** Konkurrenz-Radar. null = keine Konkurrenz-Daten (keine Konkurrenten bzw. Quelle ohne Verlauf). */
  rivalRadar: RadarItem[] | null;
}

/** Jede Datenquelle muss diese eine Funktion anbieten. */
export interface DataSource {
  kind: DataSourceKind;
  getDashboard(now?: number): Promise<DashboardData>;
  /** Steckbrief eines Shorts (null = unbekannt). Fehlt die Methode, gibt es keine Steckbriefe. */
  getShortDetail?(id: string, now?: number): Promise<ShortDetail | null>;
}

// ───────────── Short-Steckbrief (Phase 7) ─────────────

export interface ShortHistoryPoint {
  t: number;
  views: number;
  likes: number | null;
  comments: number | null;
}

/** Ein YouTube-Kommentar (Kommentar-Puls, Phase 7). */
export interface CommentItem {
  id: string;
  videoId: string;
  channelId: string;
  author: string;
  text: string;
  likes: number;
  replies: number;
  publishedAt: number;
  /** Titel des Shorts (für Listen; im Dashboard ergänzt). */
  videoTitle?: string;
}

/** Konkurrenz-Radar: ein Konkurrenz-Short, der gerade ungewöhnlich abgeht (Phase 7). */
export interface RadarItem {
  id: string;
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: number;
  views: number;
  views24h: number;
  /** Wie viel mal so stark wie üblich (siehe `kind`). */
  factor: number;
  /** new = unter 48 Std. (Gesamtaufrufe vs. üblicher Endstand), breakout = älter (24h-Aufrufe vs. üblich). */
  kind: "new" | "breakout";
  /** Ø Aufrufe pro Stunde (24h bzw. seit Upload). */
  perHour: number;
}

/** Kommentar-Puls (Phase 7). */
export interface CommentPulse {
  recent: CommentItem[];
  /** Meistgelikte Kommentare der letzten 7 Tage. */
  top: CommentItem[];
  /** Shorts mit den meisten neuen Kommentaren in 24 Std. */
  hotShorts: { id: string; channelId: string; title: string; thumbnailUrl: string | null; comments24h: number }[];
}

export interface ShortDetail {
  short: RankedShort & { comments: number; removed: boolean; statsAt: number | null };
  channel: ChannelConfig;
  /** Eigener Kanal (sonst Konkurrent – ohne Analytics). */
  isOwn: boolean;
  /** Platz im Kanal nach Aufrufen gesamt / 7 Tage / 24 Std. (1 = bester). */
  rank: { all: number; d7: number; d24: number; of: number };
  /** Gespeicherte Messpunkte (seit Beginn der Schnappschüsse), aufsteigend. */
  history: ShortHistoryPoint[];
  /** YouTube Analytics der letzten 28 Tage (null = nicht verbunden bzw. nicht unter den Top 200). */
  analytics: AnalyticsShort | null;
  /** Boxenstrategie: Zeitfenster dieses Shorts und sein Leistungs-Index. */
  timing: {
    weekday: number;
    block: number;
    index: number | null;
    source: SampleSource | null;
    /** Durchschnitt des Kanals in diesem Zeitfenster (Index) und Anzahl Shorts dort. */
    blockScore: number | null;
    blockN: number;
  };
  comments: CommentItem[];
  /** Wie viel Verlauf gemessen ist (Stunden). */
  historyHours: number;
  generatedAt: number;
}
