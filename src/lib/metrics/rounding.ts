/**
 * So rundet YouTube öffentliche Abozahlen: ab 1.000 nur 3 gültige Stellen,
 * immer abgerundet. Beispiele: 102.345 → 102.000, 28.456 → 28.400, 1.234 → 1.230.
 */
export function roundSubscribersLikeYouTube(n: number): number {
  const v = Math.floor(n);
  if (v < 1000) return v;
  const digits = Math.floor(Math.log10(v)) + 1;
  const factor = 10 ** (digits - 3);
  return Math.floor(v / factor) * factor;
}
