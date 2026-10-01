"use client";

import { useState } from "react";
import { useDashboardData, useNow } from "@/components/dashboard/DashboardDataProvider";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { TimingAnalysis, TimingConfidence, TimingRecent } from "@/lib/data/types";
import {
  formatDate,
  formatDayClock,
  formatHourRange,
  formatIndex,
  formatShare,
  WEEKDAYS_LONG,
  zoneShiftHours,
} from "@/lib/format";
import { slotOf, TIMING } from "@/lib/metrics/upload-timing";
import { slotTone } from "@/components/ui/slot-tone";
import { TimingHeatmap } from "./TimingHeatmap";

const COMPETITORS = "competitors";
const H = 3_600_000;

const range = (block: number) => formatHourRange(block * TIMING.blockHours, TIMING.blockHours);

/**
 * „Boxenstrategie“: Zu welcher Uhrzeit (und an welchem Wochentag) laufen Uploads am
 * besten? Rechnung in src/lib/metrics/upload-timing.ts.
 */
export function UploadTimingWidget() {
  const { data } = useDashboardData();
  const [scope, setScope] = useState<string | null>(null);
  const timing = data.uploadTiming;
  if (!timing || timing.length === 0) return null;

  const analysis = timing.find((t) => t.scope === scope) ?? timing[0];
  const isRivals = analysis.scope === COMPETITORS;
  const channel = data.channels.find((c) => c.channel.id === analysis.scope)?.channel ?? null;
  const nyShift = zoneShiftHours("America/New_York", data.generatedAt);

  const options = timing.map((t) => ({
    value: t.scope,
    label: t.scope === COMPETITORS ? "Konkurrenz" : (data.channels.find((c) => c.channel.id === t.scope)?.channel.code ?? "?"),
  }));

  return (
    <WidgetCard
      title="Boxenstrategie · beste Upload-Uhrzeit"
      subtitle={
        isRivals
          ? "Wann laufen die Uploads deiner Konkurrenten am besten? 1,0× = normal für den jeweiligen Kanal."
          : "Wann laufen deine Uploads am besten? 1,0× = normal für den Kanal (fair verglichen mit Shorts aus denselben Wochen)."
      }
      actions={<SegmentedControl label="Kanal" value={analysis.scope} onChange={setScope} options={options} />}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-3">
          <RecommendationCard analysis={analysis} isRivals={isRivals} nyShift={nyShift} />
          {!isRivals ? <Experiments analysis={analysis} /> : null}
        </div>
        <div className="min-w-0 lg:col-span-2">
          <TimingHeatmap
            analysis={analysis}
            nyShift={nyShift}
            channelColor={isRivals ? null : (channel?.color ?? null)}
            defaultLabel={isRivals ? "Hauptzeit der Konkurrenz" : "deine Standard-Zeit"}
          />
        </div>
      </div>

      {!isRivals && analysis.recent.length > 0 ? <TestLog recent={analysis.recent} /> : null}

      <details className="mt-4 text-xs text-muted">
        <summary className="cursor-pointer select-none text-ink-2 hover:text-ink">So rechnet die Boxenstrategie</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <b className="text-ink-2">Langzeit-Vergleich:</b> Jeder Short ab 7 Tagen Alter wird mit den Shorts verglichen, die ±15
            Tage um ihn herum erschienen sind. So zählt nicht, dass der Kanal inzwischen größer ist.
          </li>
          <li>
            <b className="text-ink-2">24h-Messung:</b> Seit dem Start der Schnappschüsse messen wir für jeden neuen Short die
            Aufrufe nach genau 24 Stunden. Das ist genauer und ersetzt den Langzeit-Wert, sobald es ihn gibt.
          </li>
          <li>
            <b className="text-ink-2">Fair bei wenigen Shorts:</b> Ausreißer werden gedeckelt, Zeitfenster mit wenigen Shorts
            Richtung 1,0× gezogen. „Deutlich“ heißt: Der Unterschied ist sehr wahrscheinlich kein Zufall.
          </li>
          <li>
            <b className="text-ink-2">Publikum aktiv:</b> Wann dein Kanal insgesamt die meisten Aufrufe pro Stunde bekommt
            (letzte 14 Tage). Ein Upload 1–3 Std. vor dieser Spitze bekommt den meisten Schwung.
          </li>
        </ul>
      </details>
    </WidgetCard>
  );
}

// ───────────── Empfehlung ─────────────

const CONFIDENCE: Record<TimingConfidence, { bars: number; label: string; hint: string }> = {
  deutlich: { bars: 3, label: "deutlich", hint: "Sehr wahrscheinlich kein Zufall." },
  tendenz: { bars: 2, label: "Tendenz", hint: "Spricht einiges dafür – mehr Tests machen es sicher." },
  unsicher: { bars: 1, label: "unsicher", hint: "Könnte noch Zufall sein – weiter testen." },
};

function ConfidenceMeter({ level }: { level: TimingConfidence }) {
  const c = CONFIDENCE[level];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2" title={c.hint}>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`inline-block w-1 rounded-sm ${i <= c.bars ? "bg-ink" : "bg-surface-3"}`}
            style={{ height: 4 + i * 3 }}
          />
        ))}
      </span>
      Sicherheit: {c.label}
    </span>
  );
}

function RecommendationCard({ analysis, isRivals, nyShift }: { analysis: TimingAnalysis; isRivals: boolean; nyShift: number }) {
  const rec = analysis.recommendation;
  const basis = (
    <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
      {analysis.samples} Shorts ausgewertet
      {isRivals ? "" : ` · ${analysis.samplesFirst24h} mit 24h-Messung`}
    </p>
  );

  if (!rec) {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-4">
        <p className="f1-heading text-[11px] text-muted">Empfehlung</p>
        <p className="mt-1 text-lg font-semibold text-ink">Noch zu wenig Daten</p>
        <p className="mt-1 text-sm text-muted">
          Sobald in einem Zeitfenster mindestens {TIMING.minTested} Shorts älter als eine Woche sind (oder ihre 24h-Messung
          haben), steht hier eine Empfehlung.
        </p>
        {basis}
      </div>
    );
  }

  const same = rec.block === rec.defaultBlock;
  const headline = isRivals
    ? same
      ? `Konkurrenz läuft zur Hauptzeit am besten: ${range(rec.block)}`
      : `Konkurrenz läuft am besten um ${range(rec.block)}`
    : same
      ? `Bleib bei ${range(rec.block)}`
      : rec.confidence === "deutlich"
        ? `Wechsel auf ${range(rec.block)}`
        : rec.confidence === "tendenz"
          ? `Teste mehr um ${range(rec.block)}`
          : `Vielleicht ${range(rec.block)}`;
  const best = analysis.byBlock[rec.block];

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="f1-heading text-[11px] text-muted">{isRivals ? "Beste Zeit der Konkurrenz" : "Empfehlung"}</p>
        <ConfidenceMeter level={rec.confidence} />
      </div>
      <p className="mt-1.5 text-lg font-semibold leading-snug text-ink">{headline}</p>
      <p className="text-xs text-muted">= {formatHourRange(rec.block * TIMING.blockHours + nyShift)} in New York</p>

      <div className="mt-3 flex items-end gap-3">
        <span
          className="num whitespace-nowrap rounded-lg px-2 py-1 text-2xl font-bold text-ink"
          style={{ background: slotTone(best, !same || best.score > 1.05) }}
        >
          {same ? formatIndex(best.score) : `+${Math.round(rec.upliftPct)} %`}
        </span>
        <span className="pb-1 text-xs leading-snug text-ink-2">
          {same
            ? `Leistung im Schnitt (${best.n} Shorts)`
            : `mehr Aufrufe als zur ${isRivals ? "Hauptzeit" : "Standard-Zeit"} ${range(rec.defaultBlock)}`}
        </span>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-ink-2">
        <li>
          {isRivals ? "Hauptzeit der Konkurrenz" : "Deine Standard-Zeit"}: <b className="text-ink">{range(rec.defaultBlock)}</b> (
          {formatShare(rec.defaultShare)} der Uploads, {formatIndex(analysis.byBlock[rec.defaultBlock].score)})
        </li>
        {!same ? (
          <li>
            {range(rec.block)}: {formatIndex(best.score)} aus {best.n} Shorts
          </li>
        ) : null}
        {rec.weekday !== null && rec.weekdayUpliftPct !== null ? (
          <li>
            Bester Tag: <b className="text-ink">{WEEKDAYS_LONG[rec.weekday]}</b> (+{Math.round(rec.weekdayUpliftPct)} %)
          </li>
        ) : (
          <li className="text-muted">Wochentag: kein klarer Unterschied</li>
        )}
      </ul>
      <p className="mt-2 text-[11px] text-muted">{CONFIDENCE[rec.confidence].hint}</p>
      {basis}
    </div>
  );
}

// ───────────── Test-Vorschläge ─────────────

function Experiments({ analysis }: { analysis: TimingAnalysis }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="f1-heading text-[11px] text-muted">Nächste Testfahrten</p>
      {analysis.experiments.length === 0 ? (
        <p className="mt-1.5 text-xs text-ink-2">
          Je mehr Abwechslung, desto sicherer die Aussage: 2–3 Uploads in einem neuen Zeitfenster reichen für einen ersten
          Vergleich.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {analysis.experiments.map((e) => (
            <li key={e.block} className="text-xs">
              <b className="num text-sm text-ink">{range(e.block)}</b>
              <span className="block text-ink-2">
                {e.reason === "audience"
                  ? `Dein Publikum ist 1–3 Std. danach besonders aktiv (${formatShare(e.value)} der Spitze).`
                  : `Läuft bei der Konkurrenz ${formatIndex(e.value)} – bei dir noch kaum getestet.`}
              </span>
            </li>
          ))}
          <li className="text-[11px] text-muted">2–3 Uploads dort reichen für einen ersten Vergleich.</li>
        </ul>
      )}
    </div>
  );
}

// ───────────── Testprotokoll ─────────────

function TestLog({ recent }: { recent: TimingRecent[] }) {
  const now = useNow();
  return (
    <div className="mt-5">
      <p className="f1-heading mb-2 text-[11px] text-muted">Testprotokoll · letzte Uploads</p>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="w-24 pb-2 font-medium sm:w-40">Upload</th>
            <th className="pb-2 font-medium">Short</th>
            <th className="w-28 pb-2 text-right font-medium sm:w-56">Ergebnis</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((r) => {
            const { block } = slotOf(r.publishedAt);
            return (
              <tr key={r.videoId} className="border-t border-line">
                <td className="num py-2 text-xs leading-tight text-ink-2">
                  {formatDayClock(r.publishedAt)}
                  <span className="block text-[11px] text-muted sm:ml-2 sm:inline">{range(block)}</span>
                </td>
                <td className="py-2 pr-2">
                  <a
                    href={`/short/${r.videoId}`}
                    className="block truncate text-ink hover:underline"
                    title={r.title}
                  >
                    {r.title || r.videoId}
                  </a>
                </td>
                <td className="py-2 text-right">
                  <Result r={r} now={now} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Result({ r, now }: { r: TimingRecent; now: number }) {
  if (r.index === null) {
    const due24 = r.publishedAt + 24 * H;
    return (
      <span className="text-[11px] leading-tight text-muted">
        {now < due24 ? `24h-Wert ab ${formatDayClock(due24)}` : `Langzeit-Wert ab ${formatDate(r.publishedAt + 7 * 24 * H)}`}
      </span>
    );
  }
  const stat = { n: TIMING.minTested, score: r.index, median: r.index, se: null, meanLog: Math.log(r.index) };
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[10px] text-muted">{r.source === "first24h" ? "24h" : "Langzeit"}</span>
      <span className="num rounded-md px-1.5 py-0.5 text-xs font-semibold text-ink" style={{ background: slotTone(stat) }}>
        {formatIndex(r.index)}
      </span>
    </span>
  );
}
