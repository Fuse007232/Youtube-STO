/**
 * Zählt verbrauchte API-Einheiten pro Tag.
 * YouTube setzt das Kontingent um Mitternacht pazifischer Zeit zurück (9 Uhr in Deutschland).
 *
 * Hinweis: Bis Phase 3 zählt das nur innerhalb einer laufenden Server-Instanz
 * (Näherungswert). Ab Phase 3 wird der Verbrauch in der Datenbank protokolliert.
 */
const pacificDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function quotaDayKey(t: number): string {
  return pacificDay.format(t);
}

let state = { day: "", used: 0 };

export function addQuotaUnits(units: number, now = Date.now()): void {
  const day = quotaDayKey(now);
  if (state.day !== day) state = { day, used: 0 };
  state.used += units;
}

export function quotaUsedToday(now = Date.now()): number {
  return state.day === quotaDayKey(now) ? state.used : 0;
}

/** Nur für Tests. */
export function resetQuotaCounter(): void {
  state = { day: "", used: 0 };
}
