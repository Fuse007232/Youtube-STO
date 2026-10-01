import type { ChannelPoint } from "@/lib/data/types";

/**
 * Reine Rechenfunktionen auf Schnappschuss-Verläufen.
 * Alle Verläufe müssen nach Zeit (t) aufsteigend sortiert sein.
 */

export const HOUR_MS = 3_600_000;

/** Letzter Messpunkt, der zum Zeitpunkt `t` schon existierte (oder null). */
export function pointAt(points: ChannelPoint[], t: number): ChannelPoint | null {
  // Binäre Suche: schnell auch bei langen Verläufen.
  let lo = 0;
  let hi = points.length - 1;
  let found: ChannelPoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) {
      found = points[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * Gewinn im Zeitfenster, das bei `endT` endet und `hours` lang ist.
 * Null, wenn es für den Fensteranfang noch keinen Messpunkt gibt.
 */
export function windowDelta(
  points: ChannelPoint[],
  endT: number,
  hours: number,
): { views: number; subscribers: number } | null {
  const end = pointAt(points, endT);
  const start = pointAt(points, endT - hours * HOUR_MS);
  if (!end || !start) return null;
  return {
    views: end.views - start.views,
    subscribers: end.subscribers - start.subscribers,
  };
}

/** Gewinn der letzten `hours` Stunden, gemessen ab dem neuesten Messpunkt. */
export function latestDelta(points: ChannelPoint[], hours: number) {
  if (points.length === 0) return null;
  return windowDelta(points, points[points.length - 1].t, hours);
}

/**
 * Bester gleitender Gewinn über `hours` Stunden im ganzen Verlauf
 * (geprüft an jedem Messpunkt, der weit genug hinten liegt).
 */
export function bestRollingDelta(
  points: ChannelPoint[],
  hours: number,
): { views: number; subscribers: number } | null {
  if (points.length === 0) return null;
  const earliestEnd = points[0].t + hours * HOUR_MS;
  let best: { views: number; subscribers: number } | null = null;
  for (const p of points) {
    if (p.t < earliestEnd) continue;
    const d = windowDelta(points, p.t, hours);
    if (!d) continue;
    best = best
      ? {
          views: Math.max(best.views, d.views),
          subscribers: Math.max(best.subscribers, d.subscribers),
        }
      : d;
  }
  return best;
}

/** Aufrufe pro Sekunde, gemessen über das letzte Zeitfenster (Standard: 1 Stunde). */
export function viewsPerSecond(points: ChannelPoint[], windowMs = HOUR_MS): number {
  if (points.length < 2) return 0;
  const last = points[points.length - 1];
  const start = pointAt(points, last.t - windowMs) ?? points[0];
  const seconds = (last.t - start.t) / 1000;
  if (seconds <= 0) return 0;
  return Math.max(0, (last.views - start.views) / seconds);
}

/** Verlauf auf ein gröberes Raster verdichten (z. B. 15 Min. → 1 Std.). */
export function downsample(points: ChannelPoint[], stepMs: number): ChannelPoint[] {
  const out: ChannelPoint[] = [];
  let lastBucket = -Infinity;
  for (const p of points) {
    const bucket = Math.floor(p.t / stepMs);
    if (bucket !== lastBucket) {
      out.push(p);
      lastBucket = bucket;
    }
  }
  // Den neuesten Punkt immer behalten, damit die Kurve bis „jetzt“ reicht.
  const last = points[points.length - 1];
  if (last && out[out.length - 1] !== last) out.push(last);
  return out;
}
