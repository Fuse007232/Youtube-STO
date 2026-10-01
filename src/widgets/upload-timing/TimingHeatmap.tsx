"use client";

import type { SlotStat, TimingAnalysis } from "@/lib/data/types";
import { formatCompact, formatHourRange, formatIndex, formatOneDecimal, WEEKDAYS_LONG, WEEKDAYS_SHORT } from "@/lib/format";
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

function describe(stat: SlotStat, where: string): string {
  if (stat.n === 0) return `${where}: noch kein Upload`;
  const n = stat.n === 1 ? "1 Short" : `${stat.n} Shorts`;
  if (stat.n < TIMING.minTested) return `${where}: ${n} – zu wenig für eine Aussage`;
  return `${where}: ${formatIndex(stat.score)} (${n})`;
}

function Cell({ stat, best, highlight, label }: { stat: SlotStat; best: boolean; highlight: boolean; label: string }) {
  const ring = highlight ? "ring-1 ring-inset ring-ink/45" : "";
  if (stat.n === 0) {
    return <div title={describe(stat, label)} className={`h-10 rounded-md border border-dashed border-line ${ring}`} />;
  }
  const tested = stat.n >= TIMING.minTested;
  return (
    <div
      title={describe(stat, label)}
      className={`flex h-10 flex-col items-center justify-center rounded-md leading-none ${ring}`}
      style={{ background: slotTone(stat, best) }}
    >
      <span className={`num text-[11px] font-semibold ${tested ? "text-ink" : "text-muted"}`}>
        {tested ? formatIndex(stat.score) : "?"}
      </span>
      <span className="num mt-0.5 text-[9px] text-ink-2/70">{stat.n}</span>
    </div>
  );
}

const GRID = "grid grid-cols-[2.75rem_repeat(12,minmax(2.6rem,1fr))_3rem] gap-1";

export function TimingHeatmap({
  analysis,
  nyShift,
  channelColor,
  defaultLabel = "deine Standard-Zeit",
}: {
  analysis: TimingAnalysis;
  /** Stunden-Verschiebung Berlin → New York (meist −6). */
  nyShift: number;
  /** Farbe für den Publikums-Streifen (null = keiner). */
  channelColor: string | null;
  /** Beschriftung des Rahmens in der Legende. */
  defaultLabel?: string;
}) {
  const rec = analysis.recommendation;
  const defaultBlock = rec?.defaultBlock ?? -1;
  const bestBlock = rec && analysis.byBlock[rec.block].score > 1.05 ? rec.block : -1;

  // Bestes Einzelfeld (Wochentag × Uhrzeit), nur unter ausreichend getesteten
  let bestCell = { d: -1, b: -1, score: 1.05 };
  analysis.cells.forEach((row, d) =>
    row.forEach((s, b) => {
      if (s.n >= TIMING.minTested && s.score > bestCell.score) bestCell = { d, b, score: s.score };
    }),
  );
  // Bester Wochentag nur, wenn er sich wirklich abhebt (sonst wäre lila nur Zufall)
  const bestDay = rec?.weekday ?? -1;

  const blocks = Array.from({ length: TIMING.blocks }, (_, b) => b);
  const activity = analysis.activity;
  // Kontrast: schwächste Stunde ≈ blass, stärkste = volle Farbe
  const low = activity ? Math.min(...activity) : 0;
  const peak = activity ? Math.max(...activity) : 1;
  const peakHour = activity ? activity.indexOf(peak) : -1;
  const strength = (v: number) => (peak > low ? (v - low) / (peak - low) : 1);

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[660px]">
          {/* Kopf: Uhrzeit (Berlin) + New York */}
          <div className={GRID}>
            <div className="leading-tight">
              <div className="text-[11px] text-ink-2">Berlin</div>
              <div className="text-[9px] text-muted">New York</div>
            </div>
            {blocks.map((b) => (
              <div key={b} className="text-center leading-tight">
                <div className={`num text-[11px] ${b === defaultBlock ? "font-semibold text-ink" : "text-ink-2"}`}>
                  {formatHourRange(b * TIMING.blockHours, TIMING.blockHours, "")}
                </div>
                <div className="num text-[9px] text-muted" title="Gleiche Zeit in New York">
                  {formatHourRange(b * TIMING.blockHours + nyShift, TIMING.blockHours, "")}
                </div>
              </div>
            ))}
            <div className="self-end text-center text-[10px] text-muted">Ø Tag</div>
          </div>
          {/* Alle Tage zusammen – die wichtigste Zeile */}
          <div className={`${GRID} mt-1.5`}>
            <div className="self-center text-[11px] font-semibold text-ink">Alle</div>
            {blocks.map((b) => (
              <Cell
                key={b}
                stat={analysis.byBlock[b]}
                best={b === bestBlock}
                highlight={b === defaultBlock}
                label={`Alle Tage, ${formatHourRange(b * TIMING.blockHours)}`}
              />
            ))}
            <div className="flex h-10 flex-col items-center justify-center rounded-md bg-surface-2 leading-none">
              <span className="num text-[11px] font-semibold text-ink-2">{analysis.samples}</span>
              <span className="mt-0.5 text-[9px] text-muted">Shorts</span>
            </div>
          </div>

          <div className="my-2 border-t border-line" />

          {/* Wochentag × Uhrzeit */}
          <div className="space-y-1">
            {analysis.cells.map((row, d) => (
              <div key={d} className={GRID}>
                <div className="self-center text-[11px] text-ink-2">{WEEKDAYS_SHORT[d]}</div>
                {row.map((s, b) => (
                  <Cell
                    key={b}
                    stat={s}
                    best={d === bestCell.d && b === bestCell.b}
                    highlight={b === defaultBlock}
                    label={`${WEEKDAYS_LONG[d]}, ${formatHourRange(b * TIMING.blockHours)}`}
                  />
                ))}
                <Cell stat={analysis.byWeekday[d]} best={d === bestDay} highlight={false} label={`${WEEKDAYS_LONG[d]} (alle Uhrzeiten)`} />
              </div>
            ))}
          </div>

          {/* Wann ist das Publikum aktiv? (Aufrufe pro Stunde des Kanals) */}
          {channelColor ? (
            <div className={`${GRID} mt-3`}>
              <div className="self-center text-[10px] leading-tight text-muted">Publikum aktiv</div>
              {activity ? (
                blocks.map((b) => (
                  <div key={b} className="flex h-4 gap-px overflow-hidden rounded-sm">
                    {[0, 1].map((k) => {
                      const h = b * TIMING.blockHours + k;
                      const share = strength(activity[h]);
                      return (
                        <div
                          key={k}
                          className="flex-1"
                          title={`${h}–${h + 1} Uhr: Ø ${formatCompact(activity[h])} Aufrufe pro Stunde`}
                          style={{ background: `color-mix(in srgb, ${channelColor} ${Math.round(8 + 87 * share)}%, transparent)` }}
                        />
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="col-span-12 self-center text-[11px] text-muted">
                  Kurve kommt, sobald jede Tagesstunde einmal gemessen ist (bisher{" "}
                  {formatOneDecimal(analysis.activityHours)} Std.).
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Legende */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
        {activity && peakHour >= 0 ? (
          <span className="text-ink-2">
            Publikum am aktivsten: {peakHour}–{peakHour + 1} Uhr
          </span>
        ) : null}
        <Legend color="var(--sector-best)" label="bestes Fenster" />
        <Legend color="var(--sector-improved)" label="besser als normal" />
        <Legend color="var(--sector-worse)" label="schwächer" />
        <Legend color="var(--sector-neutral)" label="normal" />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[3px] ring-1 ring-inset ring-ink/45" />
          {defaultLabel}
        </span>
        <span>„?“ = unter {TIMING.minTested} Shorts · kleine Zahl = Anzahl Shorts</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: `color-mix(in srgb, ${color} 55%, transparent)` }} />
      {label}
    </span>
  );
}
