/**
 * Hochrechnung zwischen zwei Schnappschüssen:
 * letzter Messwert + Tempo × vergangene Zeit.
 * Die vergangene Zeit wird gedeckelt, damit bei ausgefallenen Schnappschüssen
 * keine Fantasiezahlen entstehen.
 */
export function extrapolate(
  base: number,
  ratePerSecond: number,
  lastSnapshotAt: number,
  now: number,
  maxElapsedMs: number,
): number {
  const elapsed = Math.min(Math.max(0, now - lastSnapshotAt), maxElapsedMs);
  return base + ratePerSecond * (elapsed / 1000);
}
