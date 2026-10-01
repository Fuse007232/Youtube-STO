import type { LengthAnalysis, LengthBucket, TimingConfidence } from "@/lib/data/types";
import { TIMING, confidenceLevel, slotStat, zDiff, type TimingSample } from "./upload-timing";

/**
 * „Renndistanz“ – welche Short-Länge läuft am besten? (Phase 7)
 * Gleicher fairer Leistungs-Index wie die Boxenstrategie (1,0× = normal für den Kanal),
 * nur nach Dauer statt nach Uhrzeit gruppiert.
 */

export const LENGTH_BUCKETS: { label: string; minSec: number; maxSec: number | null }[] = [
  { label: "bis 15 s", minSec: 0, maxSec: 15 },
  { label: "15–30 s", minSec: 15, maxSec: 30 },
  { label: "30–45 s", minSec: 30, maxSec: 45 },
  { label: "45–60 s", minSec: 45, maxSec: 60 },
  { label: "über 60 s", minSec: 60, maxSec: null },
];

export function lengthBucketOf(durationSec: number): number {
  return LENGTH_BUCKETS.findIndex((b) => durationSec >= b.minSec && (b.maxSec === null || durationSec < b.maxSec));
}

export function analyzeShortLength(
  scope: string,
  samples: TimingSample[],
  durationById: Map<string, number>,
): LengthAnalysis {
  const groups: number[][] = LENGTH_BUCKETS.map(() => []);
  let counted = 0;
  for (const s of samples) {
    const d = durationById.get(s.videoId);
    if (!d || d <= 0) continue;
    const b = lengthBucketOf(d);
    if (b < 0) continue;
    groups[b].push(s.index);
    counted++;
  }
  const buckets: LengthBucket[] = LENGTH_BUCKETS.map((b, i) => ({ ...b, stat: slotStat(groups[i]) }));

  const tested = buckets.map((b, i) => ({ s: b.stat, i })).filter((x) => x.s.n >= TIMING.minTested);
  if (tested.length === 0) {
    return { scope, samples: counted, buckets, best: null, common: null, upliftPct: null, confidence: "unsicher" };
  }
  const common = [...tested].sort((a, b) => b.s.n - a.s.n)[0];
  const best = [...tested].sort((a, b) => b.s.score - a.s.score)[0];
  let confidence: TimingConfidence;
  if (best.i !== common.i) {
    confidence = confidenceLevel(zDiff(best.s, common.s), best.s.n);
  } else {
    const second = tested.filter((x) => x.i !== best.i).sort((a, b) => b.s.score - a.s.score)[0];
    confidence = second ? confidenceLevel(zDiff(best.s, second.s), best.s.n) : "unsicher";
  }
  return {
    scope,
    samples: counted,
    buckets,
    best: best.i,
    common: common.i,
    upliftPct: best.i === common.i ? 0 : (best.s.score / common.s.score - 1) * 100,
    confidence,
  };
}
