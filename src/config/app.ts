/**
 * Zentrale App-Einstellungen (keine Geheimnisse – die gehören in Umgebungsvariablen).
 */
export const APP_CONFIG = {
  /** Alle Zeitangaben im Dashboard werden in dieser Zeitzone angezeigt. */
  timeZone: "Europe/Berlin",
  /** Abstand zwischen zwei Schnappschüssen (Minuten). */
  snapshotIntervalMin: 15,
  /** Wie oft der Browser neue Daten vom Server holt (Millisekunden). */
  pollIntervalMs: 60_000,
  /**
   * Hochrechnung: So lange (in Vielfachen des Schnappschuss-Abstands) darf
   * zwischen zwei Schnappschüssen weitergezählt werden. Danach bleibt die Zahl
   * stehen, damit bei einem ausgefallenen Schnappschuss nichts „davonläuft“.
   */
  maxExtrapolationFactor: 1.5,
  /** Tageskontingent der YouTube Data API (Einheiten). */
  youtubeDailyQuota: 10_000,
  /**
   * Feste öffentliche Adresse des Dashboards (kein Geheimnis).
   * Der Google-Login nutzt IMMER diese Adresse als Rückkehr-Adresse – genau so
   * muss sie in der Google Cloud eingetragen sein.
   */
  publicUrl: "https://youtube-sto.vercel.app",
  /** Wie viele Einträge die Top-Shorts-Rangliste zeigt. */
  topShortsLimit: 10,
} as const;
