/** Pulsierender Punkt für „live“. */
export function LiveDot({ color = "var(--live)" }: { color?: string }) {
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden>
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
        style={{ backgroundColor: color }}
      />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}
