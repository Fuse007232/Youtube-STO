import { APP_CONFIG } from "@/config/app";

/** Zahlen- und Zeitformate auf Deutsch (z. B. 1.234.567, „vor 3 Min.“). */

const intFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const twoDecimals = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const clockFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_CONFIG.timeZone,
  hour: "2-digit",
  minute: "2-digit",
});
const dayClockFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_CONFIG.timeZone,
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: APP_CONFIG.timeZone,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** 1234567 → „1.234.567“ */
export function formatNumber(n: number): string {
  return intFormat.format(Math.round(n));
}

/** Kurzform: 41230 → „41,2K“, 1234567 → „1,23 Mio.“ */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000_000) return `${sign}${twoDecimals.format(abs / 1e9)} Mrd.`;
  if (abs >= 1_000_000) return `${sign}${twoDecimals.format(abs / 1e6)} Mio.`;
  if (abs >= 10_000) return `${sign}${oneDecimal.format(abs / 1e3)}K`;
  return `${sign}${intFormat.format(Math.round(abs))}`;
}

/** Mit Vorzeichen: „+1.234“ / „−56“ / „±0“. Echte Minus-Zeichen (−). */
export function formatSigned(n: number, compact = false): string {
  const r = Math.round(n);
  if (r === 0) return "±0";
  const body = compact ? formatCompact(Math.abs(r)) : formatNumber(Math.abs(r));
  return `${r > 0 ? "+" : "−"}${body}`;
}

/** Uhrzeit in Berliner Zeit: „14:45“ */
export function formatClock(t: number): string {
  return clockFormat.format(t);
}

/** Wochentag + Uhrzeit: „Mo., 14:45“ */
export function formatDayClock(t: number): string {
  return dayClockFormat.format(t);
}

/** Datum: „01.10.2026“ */
export function formatDate(t: number): string {
  return dateFormat.format(t);
}

/** Relative Zeit in der Vergangenheit: „gerade eben“, „vor 3 Min.“, „vor 5 Std.“, „vor 2 Tagen“. */
export function formatAgo(t: number, now: number): string {
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return "gerade eben";
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  if (d < 30) return d === 1 ? "vor 1 Tag" : `vor ${d} Tagen`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return mo === 1 ? "vor 1 Monat" : `vor ${mo} Monaten`;
  const y = Math.floor(d / 365);
  return y === 1 ? "vor 1 Jahr" : `vor ${y} Jahren`;
}

/** Countdown in der Zukunft: „in 12 Min.“, „in 40 Sek.“, „jetzt“. */
export function formatIn(t: number, now: number): string {
  const sec = Math.round((t - now) / 1000);
  if (sec <= 0) return "jetzt";
  if (sec < 60) return `in ${sec} Sek.`;
  return `in ${Math.ceil(sec / 60)} Min.`;
}

/** Sekunden → „0:42“ */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Beschriftung für Gewinne: „in 24h“ – oder, solange noch keine 24 Stunden
 * gemessen wurden, „seit 3 Std.“ bzw. „seit 20 Min.“.
 */
export function formatWindowLabel(historyHours: number, windowHours = 24): string {
  if (historyHours >= windowHours) return windowHours === 24 ? "in 24h" : `in ${windowHours / 24} Tagen`;
  if (historyHours < 1) return `seit ${Math.max(1, Math.round(historyHours * 60))} Min.`;
  return `seit ${Math.floor(historyHours)} Std.`;
}

/** Kurzer Hinweis, warum es (noch) keine 24h-Werte gibt – je nach Datenquelle. */
export function noHistoryHint(source: "mock" | "youtube" | "database"): string {
  return source === "database"
    ? "ab dem nächsten Schnappschuss"
    : "sobald die Datenbank Schnappschüsse sammelt";
}

const percentFormat = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });
const oneDecimalPlain = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** 0.86 → „86 %“ */
export function formatShare(share: number): string {
  return percentFormat.format(share);
}

/** 78.4 → „78 %“ (Wert ist schon in Prozent) */
export function formatPercentValue(pct: number): string {
  return `${Math.round(pct)} %`;
}

/** 2.345 → „2,3“ */
export function formatOneDecimal(n: number): string {
  return oneDecimalPlain.format(n);
}

/** „2026-09-30“ → „30.09.“ */
export function formatIsoDayShort(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}.${m}.`;
}

/** Wochentage, Montag zuerst (wie in der Boxenstrategie). */
export const WEEKDAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const WEEKDAYS_LONG = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"] as const;

const indexFormat = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Leistungs-Index: 1.46 → „1,5×“ */
export function formatIndex(x: number): string {
  return `${indexFormat.format(x)}×`;
}

/** Zeitfenster ab Stunde `start`: (12, 2) → „12–14 Uhr“ */
export function formatHourRange(start: number, hours = 2, suffix = " Uhr"): string {
  const s = ((start % 24) + 24) % 24;
  return `${s}–${s + hours}${suffix}`;
}

/** Wie viele Stunden liegt `timeZone` zum Zeitpunkt `t` gegenüber Berlin? (New York: meist −6) */
export function zoneShiftHours(timeZone: string, t: number): number {
  const hourIn = (tz: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(t);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return get("day") * 24 + get("hour");
  };
  let diff = hourIn(timeZone) - hourIn(APP_CONFIG.timeZone);
  // Monatswechsel zwischen den Zonen ausgleichen
  if (diff > 12) diff -= 24 * Math.round(diff / 24);
  if (diff < -12) diff += 24 * Math.round(-diff / 24);
  return diff;
}
