/**
 * Farbcode wie bei F1-Sektorzeiten:
 * - "best"     (lila): bester 24h-Wert im gespeicherten Verlauf
 * - "improved" (grün): besser als die 24 Stunden davor
 * - "worse"    (gelb): schwächer als die 24 Stunden davor
 * - "neutral"  (grau): kein Vergleich möglich oder gleich
 */
export type SectorStatus = "best" | "improved" | "worse" | "neutral";

export function sectorStatus(
  value: number,
  previous: number | null,
  best: number | null,
): SectorStatus {
  if (best !== null && value > 0 && value >= best) return "best";
  if (previous === null || value === previous) return "neutral";
  return value > previous ? "improved" : "worse";
}
