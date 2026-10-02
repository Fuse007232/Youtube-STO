/** Schimmernde Platzhalter statt leerer Flächen, solange Daten laden. */

function Block({ className }: { className: string }) {
  return <div className={`skeleton rounded-lg ${className}`} />;
}

function CardSkeleton({ className, lines = 3 }: { className: string; lines?: number }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface/60 p-5 ${className}`}>
      <Block className="h-3.5 w-40" />
      <Block className="mt-2 h-2.5 w-64 max-w-full" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Block key={i} className={`h-8 ${i % 2 ? "w-11/12" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

/** Startampel: fünf Lichter gehen nacheinander an, dann „Lights out“. */
export function StartLights() {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`start-light start-light-${i} h-3 w-3 rounded-full`} />
      ))}
    </div>
  );
}

/** Erstes Laden des Dashboards („Formationsrunde“). */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-5 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="f1-heading text-[11px] text-live">YouTube Shorts</p>
            <h1 className="f1-heading text-2xl text-ink sm:text-3xl">Live Timing</h1>
          </div>
          <Block className="hidden h-9 w-[26rem] rounded-xl md:block" />
        </div>
        <Block className="h-8 w-56" />
      </header>

      <div className="mb-5 flex items-center gap-4 rounded-2xl border border-line bg-surface/60 px-4 py-3">
        <StartLights />
        <p role="status" className="f1-heading text-xs text-ink-2">
          Formationsrunde · Daten werden geladen …
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4 lg:gap-5" aria-hidden>
        <CardSkeleton className="col-span-12 md:col-span-6" lines={2} />
        <CardSkeleton className="col-span-12 md:col-span-6" lines={2} />
        <CardSkeleton className="col-span-12 xl:col-span-4" lines={6} />
        <CardSkeleton className="col-span-12 xl:col-span-8" lines={6} />
        <CardSkeleton className="col-span-12 xl:col-span-8" lines={5} />
        <CardSkeleton className="col-span-12 xl:col-span-4" lines={5} />
      </div>
    </div>
  );
}

/** Laden eines Short-Steckbriefs (Kopf bleibt stehen). */
export function ShortSkeleton() {
  return (
    <div className="mx-auto max-w-[1200px]" aria-hidden>
      <div className="mb-4 flex items-center justify-between">
        <Block className="h-7 w-24" />
        <p className="f1-heading text-[11px] text-live">Short-Steckbrief</p>
      </div>
      <div className="mb-4 flex gap-5 rounded-2xl border border-line bg-surface/60 p-5">
        <Block className="w-20 shrink-0 rounded-xl sm:w-32" />
        <div className="flex-1 space-y-3 py-1" style={{ minHeight: 180 }}>
          <Block className="h-3 w-32" />
          <Block className="h-6 w-3/4" />
          <Block className="h-3 w-1/2" />
          <Block className="mt-6 h-8 w-44" />
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-xl border border-line bg-surface/60 p-3">
            <Block className="h-2.5 w-16" />
            <Block className="mt-2 h-5 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <CardSkeleton className="lg:col-span-2" lines={6} />
        <CardSkeleton className="" lines={4} />
      </div>
    </div>
  );
}
