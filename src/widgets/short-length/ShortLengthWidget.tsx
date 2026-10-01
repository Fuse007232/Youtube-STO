"use client";

import { useState } from "react";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { COMPETITORS_SCOPE, scopeOptions } from "@/components/dashboard/scope";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { LengthAnalysis, TimingConfidence } from "@/lib/data/types";
import { formatIndex } from "@/lib/format";
import { TIMING } from "@/lib/metrics/upload-timing";
import { slotTone } from "@/components/ui/slot-tone";

const CONFIDENCE: Record<TimingConfidence, string> = {
  deutlich: "Sicherheit: deutlich",
  tendenz: "Sicherheit: Tendenz",
  unsicher: "Sicherheit: unsicher – könnte Zufall sein",
};

/** „Renndistanz“: Welche Short-Länge läuft am besten? */
export function ShortLengthWidget() {
  const { data } = useDashboardData();
  const [scope, setScope] = useState<string | null>(null);
  const all = data.shortLength;
  if (!all || all.length === 0) return null;
  const a = all.find((x) => x.scope === scope) ?? all[0];
  const isRivals = a.scope === COMPETITORS_SCOPE;

  return (
    <WidgetCard
      title="Renndistanz · beste Short-Länge"
      subtitle={`Leistung nach Dauer – 1,0× = normal für den ${isRivals ? "jeweiligen " : ""}Kanal.`}
      actions={
        <SegmentedControl label="Kanal" value={a.scope} onChange={setScope} options={scopeOptions(data, all.map((x) => x.scope))} />
      }
    >
      <Verdict a={a} isRivals={isRivals} />
      <ul className="mt-4 space-y-2.5">
        {a.buckets.map((b, i) => {
          const tested = b.stat.n >= TIMING.minTested;
          // Skala: 0× … 2× (1,0× = Mitte)
          const width = Math.min(1, b.stat.score / 2) * 100;
          return (
            <li key={b.label} className="grid grid-cols-[4.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
              <span className={`num text-xs ${i === a.common ? "font-semibold text-ink" : "text-ink-2"}`}>{b.label}</span>
              <span className="relative h-6 rounded-md bg-surface-2">
                {b.stat.n > 0 ? (
                  <span
                    className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-700"
                    style={{ width: `${width}%`, background: slotTone(b.stat, i === a.best && b.stat.score > 1.05) }}
                  />
                ) : null}
                <span className="absolute inset-y-[-3px] left-1/2 w-px bg-ink/40" aria-hidden title="1,0× = normal" />
                <span className="absolute inset-y-0 left-2 flex items-center text-[11px] text-ink-2">
                  {b.stat.n === 0 ? "noch keine" : `${b.stat.n} Shorts`}
                </span>
              </span>
              <span className={`num text-right text-xs font-semibold ${tested ? "text-ink" : "text-muted"}`}>
                {b.stat.n === 0 ? "–" : tested ? formatIndex(b.stat.score) : "?"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted">
        Senkrechter Strich = 1,0× (normal). „?“ = unter {TIMING.minTested} Shorts. {a.samples} Shorts ausgewertet.
      </p>
    </WidgetCard>
  );
}

function Verdict({ a, isRivals }: { a: LengthAnalysis; isRivals: boolean }) {
  if (a.best === null || a.common === null) {
    return <p className="text-sm text-muted">Noch zu wenig Daten – es braucht mindestens {TIMING.minTested} Shorts pro Längen-Bereich.</p>;
  }
  const best = a.buckets[a.best];
  const common = a.buckets[a.common];
  const who = isRivals ? "der Konkurrenz" : "deine";
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-4 py-3">
      {a.best === a.common ? (
        <p className="text-sm text-ink">
          <b>{best.label}</b> – {who} häufigste Länge ist auch die stärkste ({formatIndex(best.stat.score)}).
        </p>
      ) : (
        <p className="text-sm text-ink">
          Am stärksten: <b>{best.label}</b> ·{" "}
          <span className="num font-semibold">+{Math.round(a.upliftPct ?? 0)} %</span> gegenüber {common.label} ({who} häufigste
          Länge)
        </p>
      )}
      <p className="mt-0.5 text-[11px] text-muted">{CONFIDENCE[a.confidence]}</p>
    </div>
  );
}
