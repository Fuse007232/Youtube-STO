import type { SlotStat } from "@/lib/data/types";
import { TIMING } from "@/lib/metrics/upload-timing";

/**
 * Farbe eines Feldes (F1-Sektorfarben): lila = bestes Fenster, grün = besser als
 * normal, gelb = schwächer, grau = normal oder zu wenig Shorts. Je deutlicher der
 * Unterschied, desto kräftiger – aber nie so hell, dass weiße Schrift schlecht lesbar wird.
 */
export function slotTone(stat: SlotStat, best = false): string {
  if (stat.n < TIMING.minTested) return "color-mix(in srgb, var(--sector-neutral) 16%, transparent)";
  const strength = Math.min(1, Math.abs(Math.log(stat.score)) / Math.log(2));
  const pct = Math.round(20 + 30 * strength);
  if (best) return `color-mix(in srgb, var(--sector-best) ${Math.max(pct, 45)}%, transparent)`;
  if (stat.score >= 1.08) return `color-mix(in srgb, var(--sector-improved) ${pct}%, transparent)`;
  if (stat.score <= 0.92) return `color-mix(in srgb, var(--sector-worse) ${pct}%, transparent)`;
  return "color-mix(in srgb, var(--sector-neutral) 35%, transparent)";
}
