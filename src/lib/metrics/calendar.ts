import { APP_CONFIG } from "@/config/app";
import type { CalendarDay, RankedShort, UploadCalendar } from "@/lib/data/types";

/**
 * Upload-Kalender (Phase 7): ein Kästchen pro Tag (Berliner Datum), Farbe = Aufrufe
 * des Tages (YouTube Analytics), dazu Uploads und Upload-Serien.
 */

const DAY = 86_400_000;
const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_CONFIG.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Datum in Berlin: „2026-10-01“ */
export function berlinDay(t: number): string {
  return dateFormat.format(t);
}

/** „2026-10-01“ + n Tage (reine Kalender-Rechnung, ohne Zeitzonen-Fallen). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** 0 = Montag … 6 = Sonntag */
export function weekdayOf(day: string): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Längste Folge aufeinanderfolgender Tage in einer sortierten Liste. */
function longestRun(days: string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

export function buildUploadCalendar(input: {
  channelId: string;
  shorts: RankedShort[];
  /** Aufrufe je Tag (YYYY-MM-DD) laut Analytics. */
  dailyViews?: Map<string, number>;
  now: number;
  weeks?: number;
}): UploadCalendar {
  const weeks = input.weeks ?? 26;
  const today = berlinDay(input.now);
  // Raster beginnt an einem Montag
  let start = addDays(today, -(weeks - 1) * 7);
  start = addDays(start, -weekdayOf(start));

  const uploadsByDay = new Map<string, number>();
  for (const s of input.shorts) {
    if (s.channelId !== input.channelId || !s.publishedAt || s.publishedAt > input.now) continue;
    const d = berlinDay(s.publishedAt);
    uploadsByDay.set(d, (uploadsByDay.get(d) ?? 0) + 1);
  }

  const days: CalendarDay[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) {
    days.push({ day: d, uploads: uploadsByDay.get(d) ?? 0, views: input.dailyViews?.get(d) ?? null });
  }

  // Aktuelle Serie: heute zählt mit, wenn schon hochgeladen – sonst ab gestern
  let currentStreak = 0;
  let cursor = uploadsByDay.has(today) ? today : addDays(today, -1);
  while (uploadsByDay.has(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  const viewDays = [...(input.dailyViews?.keys() ?? [])].sort();
  return {
    channelId: input.channelId,
    days,
    currentStreak,
    longestStreak: longestRun([...uploadsByDay.keys()].sort()),
    viewsUntil: viewDays.at(-1) ?? null,
  };
}
