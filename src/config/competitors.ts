/**
 * Einstellungen für den Konkurrenz-Vergleich (Phase 6.3).
 * Konkurrenten selbst stehen in der Datenbank (channels.kind = 'competitor')
 * und werden in den Einstellungen hinzugefügt/entfernt.
 */
export const COMPETITOR_CONFIG = {
  /** Höchstens so viele Konkurrenten (YouTube-Kontingent). */
  maxCompetitors: 8,
  /** Bei Konkurrenten nur die neuesten N × 50 Shorts beobachten. */
  maxPlaylistPages: 4,
  /** Geschätzter Verbrauch pro Konkurrent und Tag (für die Anzeige). */
  estimatedUnitsPerDay: 430,
  /**
   * Teamfarben für Konkurrenten – Kategorie-Farben 3–8 der geprüften Palette
   * (dunkler Hintergrund, auch für Farbenblinde unterscheidbar). Werden der Reihe nach vergeben.
   */
  colors: ["#199e70", "#c98500", "#d55181", "#9085e9", "#e66767", "#008300", "#8b8a96", "#b8a13a"],
} as const;

/** Freie Farbe für einen neuen Konkurrenten (erste nicht benutzte, sonst rotierend). */
export function pickCompetitorColor(used: (string | null | undefined)[]): string {
  const taken = new Set(used.filter(Boolean));
  return COMPETITOR_CONFIG.colors.find((c) => !taken.has(c)) ?? COMPETITOR_CONFIG.colors[used.length % COMPETITOR_CONFIG.colors.length];
}

/** 3-Buchstaben-Kürzel aus dem Kanalnamen (F1-Stil), eindeutig gegenüber `taken`. */
export function makeChannelCode(name: string, taken: string[]): string {
  const letters = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase();
  const words = letters.split(/\s+/).filter(Boolean);
  const candidates: string[] = [];
  if (words.length >= 3) candidates.push(words.slice(0, 3).map((w) => w[0]).join(""));
  if (words.length === 2) candidates.push((words[0].slice(0, 2) + words[1][0]).slice(0, 3));
  const flat = letters.replace(/\s+/g, "");
  if (flat.length >= 3) candidates.push(flat.slice(0, 3));
  const base = (candidates[0] ?? (flat + "XXX").slice(0, 3)).padEnd(3, "X");
  const used = new Set(taken.map((t) => t.toUpperCase()));
  for (const c of [...candidates, base]) if (c.length === 3 && !used.has(c)) return c;
  for (let i = 2; i < 100; i++) {
    const c = `${base.slice(0, i < 10 ? 2 : 1)}${i}`;
    if (!used.has(c)) return c;
  }
  return base;
}
