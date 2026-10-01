"use client";

import { useDashboardData, useNow } from "@/components/dashboard/DashboardDataProvider";
import { LiveDot } from "@/components/ui/LiveDot";
import { formatAgo, formatClock, formatIn, formatNumber } from "@/lib/format";

const SOURCE_LABEL = {
  mock: "Beispieldaten",
  youtube: "YouTube Data API",
  database: "Datenbank",
} as const;

export function StatusBarWidget() {
  const { data, error } = useDashboardData();
  const now = useNow();
  const intervalMs = data.snapshotIntervalMin * 60_000;
  const next = data.lastSnapshotAt + intervalMs;
  const progress = Math.min(1, Math.max(0, (now - data.lastSnapshotAt) / intervalMs));

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-surface/60 px-4 py-3 text-xs text-ink-2 backdrop-blur">
      <span className="inline-flex items-center gap-2">
        {data.isDemo ? (
          <span className="rounded-md bg-sector-worse/15 px-2 py-0.5 font-bold uppercase tracking-wider text-sector-worse">
            Demo · {SOURCE_LABEL[data.source]}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 font-bold uppercase tracking-wider text-ink">
            <LiveDot /> Live · {SOURCE_LABEL[data.source]}
          </span>
        )}
      </span>

      <span>
        {data.source === "youtube" ? "Letzter Abruf" : "Letzter Schnappschuss"}{" "}
        <b className="num font-semibold text-ink">{formatClock(data.lastSnapshotAt)}</b>{" "}
        <span className="text-muted">({formatAgo(data.lastSnapshotAt, now)})</span>
      </span>

      <span className="inline-flex items-center gap-2">
        Nächster <b className="num font-semibold text-ink">{formatIn(next, now)}</b>
        <span className="h-1 w-20 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span
            className="block h-full rounded-full bg-ink-2 transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%` }}
          />
        </span>
      </span>

      {data.hasHistory ? (
        <span title="Zwischen zwei Schnappschüssen zählen die Aufrufe im zuletzt gemessenen Tempo weiter.">
          <span className="text-ink">≈</span> Aufrufe laufen als Hochrechnung weiter
        </span>
      ) : (
        <span title="Für 24h-Werte, Kurven und Hochrechnung braucht es gespeicherte Schnappschüsse (Datenbank, Phase 3).">
          24h-Werte &amp; Hochrechnung folgen mit der Datenbank (Phase 3)
        </span>
      )}

      <span className="sm:ml-auto">
        API-Kontingent heute:{" "}
        <b
          className="num font-semibold text-ink"
          title="Verbrauchte YouTube-Einheiten seit 9 Uhr (Reset um Mitternacht Kalifornien). Bis Phase 3 ein Näherungswert pro Server-Instanz."
        >
          {data.quota.usedToday === null
            ? "–"
            : `≈ ${formatNumber(data.quota.usedToday)} / ${formatNumber(data.quota.dailyLimit)}`}
        </b>
      </span>

      {error ? (
        <span role="status" className="w-full text-sector-worse">
          ⚠ Aktualisierung fehlgeschlagen ({error}) – es werden die zuletzt geladenen Zahlen gezeigt.
        </span>
      ) : null}
    </div>
  );
}
