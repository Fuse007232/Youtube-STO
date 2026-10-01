/**
 * Wird sofort angezeigt, während der Server die Daten holt („Formationsrunde“).
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <p className="f1-heading text-[11px] text-live">YouTube Shorts</p>
        <h1 className="f1-heading text-2xl text-ink sm:text-3xl">Live Timing</h1>
      </header>

      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-line bg-surface/60 px-4 py-3">
        {/* Startampel: fünf rote Lichter gehen nacheinander an */}
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-3 w-3 animate-pulse rounded-full bg-live"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
        <p role="status" className="f1-heading text-xs text-ink-2">
          Formationsrunde · Zahlen werden von YouTube geholt …
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4 lg:gap-5" aria-hidden>
        {["col-span-12 md:col-span-6 h-48", "col-span-12 md:col-span-6 h-48", "col-span-12 xl:col-span-4 h-96", "col-span-12 xl:col-span-8 h-96"].map(
          (cls, i) => (
            <div key={i} className={`${cls} animate-pulse rounded-2xl border border-line bg-surface/60`} />
          ),
        )}
      </div>
    </div>
  );
}
