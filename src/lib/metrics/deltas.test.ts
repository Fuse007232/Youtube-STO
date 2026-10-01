import { describe, expect, it } from "vitest";
import type { ChannelPoint } from "@/lib/data/types";
import {
  HOUR_MS,
  bestRollingDelta,
  downsample,
  latestDelta,
  pointAt,
  viewsPerSecond,
  windowDelta,
} from "./deltas";

/** Verlauf: jede Stunde ein Punkt, Aufrufe wachsen um `perHour`. */
function series(hours: number, perHour: (h: number) => number): ChannelPoint[] {
  const pts: ChannelPoint[] = [];
  let views = 1000;
  for (let h = 0; h <= hours; h++) {
    if (h > 0) views += perHour(h);
    pts.push({ t: h * HOUR_MS, views, subscribers: Math.floor(views / 100), videoCount: h });
  }
  return pts;
}

describe("pointAt", () => {
  const pts = series(10, () => 10);
  it("findet den letzten Punkt vor oder genau zum Zeitpunkt", () => {
    expect(pointAt(pts, 3 * HOUR_MS)?.t).toBe(3 * HOUR_MS);
    expect(pointAt(pts, 3.5 * HOUR_MS)?.t).toBe(3 * HOUR_MS);
  });
  it("liefert null vor dem ersten Punkt", () => {
    expect(pointAt(pts, -1)).toBeNull();
  });
});

describe("windowDelta / latestDelta", () => {
  const pts = series(48, () => 100);
  it("berechnet den Gewinn der letzten 24 Stunden", () => {
    expect(latestDelta(pts, 24)?.views).toBe(2400);
  });
  it("berechnet den Gewinn der 24 Stunden davor", () => {
    expect(windowDelta(pts, 24 * HOUR_MS, 24)?.views).toBe(2400);
  });
  it("liefert null, wenn der Verlauf zu kurz ist", () => {
    expect(windowDelta(series(10, () => 1), 10 * HOUR_MS, 24)).toBeNull();
  });
});

describe("bestRollingDelta", () => {
  it("findet das beste 24h-Fenster", () => {
    // Stunde 30–40 ist besonders stark.
    const pts = series(72, (h) => (h > 30 && h <= 40 ? 1000 : 100));
    const best = bestRollingDelta(pts, 24);
    expect(best?.views).toBe(10 * 1000 + 14 * 100);
  });
});

describe("viewsPerSecond", () => {
  it("misst das Tempo der letzten Stunde", () => {
    const pts = series(5, () => 3600);
    expect(viewsPerSecond(pts)).toBeCloseTo(1);
  });
  it("ist 0 bei zu wenigen Punkten", () => {
    expect(viewsPerSecond(series(0, () => 1))).toBe(0);
  });
});

describe("downsample", () => {
  it("verdichtet auf ein gröberes Raster und behält den letzten Punkt", () => {
    const pts = series(10, () => 1);
    const out = downsample(pts, 3 * HOUR_MS);
    expect(out.map((p) => p.t / HOUR_MS)).toEqual([0, 3, 6, 9, 10]);
  });
});
