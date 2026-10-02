"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { ChannelCode } from "@/components/ui/ChannelCode";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { ChannelSummary, DashboardData, TimeRange } from "@/lib/data/types";
import { formatClock, formatCompact, formatDate, formatDayClock, formatSigned } from "@/lib/format";
import { rangeLabel } from "@/lib/metrics/range";
import { RangeNote, useTimeRange } from "@/components/dashboard/TimeRange";

type Metric = "views" | "subscribers";
interface Row {
  t: number;
  [channelId: string]: number;
}

interface Series {
  rows: Row[];
  /** true = ein Punkt pro Tag (Achse zeigt Datum statt Uhrzeit). */
  daily: boolean;
  effective: TimeRange;
  note: string | null;
}

/** Aus Schnappschüssen (24h / 7 Tage): Gewinn seit Beginn des Zeitraums. */
function snapshotRows(channels: ChannelSummary[], metric: Metric, range: "24h" | "7d"): Row[] {
  const byT = new Map<number, Row>();
  for (const c of channels) {
    const points = range === "24h" ? c.history24h : c.history7d;
    const base = points[0]?.[metric] ?? 0;
    for (const p of points) {
      const row = byT.get(p.t) ?? { t: p.t };
      row[c.channel.id] = p[metric] - base;
      byT.set(p.t, row);
    }
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

/** Aus Tageswerten (28 Tage / Gesamt): aufsummiert je Kanal. */
function dailyRows(perChannel: { id: string; days: { day: string; value: number }[] }[]): Row[] {
  const byT = new Map<number, Row>();
  for (const c of perChannel) {
    let sum = 0;
    for (const d of [...c.days].sort((a, b) => a.day.localeCompare(b.day))) {
      sum += d.value;
      const t = Date.parse(`${d.day}T12:00:00Z`);
      const row = byT.get(t) ?? { t };
      row[c.id] = sum;
      byT.set(t, row);
    }
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

function buildSeries(data: DashboardData, metric: Metric, range: TimeRange): Series {
  const channels = data.channels;
  const analytics = (data.analytics ?? []).filter((a) => a.daily.length > 0);
  const has28 = analytics.length > 0;
  const fromSnapshots = (r: "24h" | "7d", note: string | null): Series => ({
    rows: data.hasHistory ? snapshotRows(channels, metric, r) : [],
    daily: false,
    effective: r,
    note,
  });
  const from28 = (note: string | null): Series => ({
    rows: dailyRows(
      analytics.map((a) => ({
        id: a.channelId,
        days: a.daily.slice(-28).map((d) => ({ day: d.day, value: metric === "views" ? d.views : d.subsGained - d.subsLost })),
      })),
    ),
    daily: true,
    effective: "28d",
    note,
  });

  if (range === "24h" || range === "7d") return fromSnapshots(range, null);
  if (range === "28d") return has28 ? from28("YouTube Analytics · 2–3 Tage Verzug") : fromSnapshots("7d", "28 Tage nur mit YouTube Analytics – zeigt 7 Tage");
  // Gesamt: Aufrufe pro Tag aus dem Upload-Kalender (bis ~6 Monate), Abos nur 28 Tage
  const calendar = (data.calendar ?? []).filter((c) => c.days.some((d) => d.views !== null));
  if (metric === "views" && calendar.length > 0) {
    return {
      rows: dailyRows(
        calendar.map((c) => ({
          id: c.channelId,
          days: c.days.filter((d) => d.views !== null).map((d) => ({ day: d.day, value: d.views ?? 0 })),
        })),
      ),
      daily: true,
      effective: "all",
      note: "YouTube Analytics · bis zu 6 Monate",
    };
  }
  return has28 ? from28("Abos gesamt gibt es nicht als Verlauf – zeigt 28 Tage") : fromSnapshots("7d", "Ohne YouTube Analytics – zeigt 7 Tage");
}

export function TrendChartWidget() {
  const { data } = useDashboardData();
  const [metric, setMetric] = useState<Metric>("views");
  const { range } = useTimeRange();

  // Nur neu berechnen, wenn ein neuer Schnappschuss da ist (sonst startet die Animation ständig neu).
  const snapshotKey = data.lastSnapshotAt;
  const series = useMemo(
    () => buildSeries(data, metric, range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshotKey, metric, range],
  );
  const rows = series.rows;
  const channels = data.channels;
  const lastIndex = rows.length - 1;

  if (rows.length < 2 && !series.daily && !data.hasHistory) return <NoHistoryYet />;
  const fmtTick = (t: number) => (series.daily ? formatDate(t).slice(0, 6) : series.effective === "24h" ? formatClock(t) : formatDayClock(t));

  return (
    <WidgetCard
      title="Rennverlauf"
      subtitle={`${metric === "views" ? "Gewonnene Aufrufe" : "Gewonnene Abos"} · ${rangeLabel(series.effective)}${
        series.daily ? " (pro Tag aufsummiert)" : metric === "subscribers" ? " (öffentlich gerundet → Stufen)" : ""
      }`}
      actions={
        <>
          <SegmentedControl
            label="Kennzahl"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "views", label: "Aufrufe" },
              { value: "subscribers", label: "Abos" },
            ]}
          />
          {series.note ? <RangeNote>{series.note}</RangeNote> : null}
        </>
      }
    >
      <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap gap-4" aria-label="Legende">
        {channels.map((c) => (
          <span key={c.channel.id} className="inline-flex items-center gap-2 text-xs text-ink-2">
            <ChannelCode channel={c.channel} size="sm" />
            {c.channel.name}
          </span>
        ))}
      </div>
      {/* Füllt die Kachel in voller Höhe (mindestens 18rem) */}
      <div className="h-72 sm:h-80 xl:h-auto xl:min-h-80 xl:flex-1">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 320 }}>
          <LineChart data={rows} margin={{ top: 8, right: 92, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={fmtTick}
              stroke="var(--axis)"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v: number) => formatCompact(v)}
              stroke="var(--axis)"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={68}
            />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              content={(props) => <ChartTooltip {...props} channels={channels} fmt={series.daily ? (t) => formatDate(t).slice(0, 6) : series.effective === "24h" ? formatClock : formatDayClock} />}
            />
            {channels.map((c) => (
              <Line
                key={c.channel.id}
                dataKey={c.channel.id}
                name={c.channel.name}
                type={metric === "subscribers" ? "stepAfter" : "monotone"}
                stroke={c.channel.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                connectNulls
                animationDuration={1200}
                label={(props: { index?: number; x?: number | string; y?: number | string; value?: string | number | boolean | null }) =>
                  props.index === lastIndex ? (
                    <text
                      key="end"
                      x={Number(props.x) + 8}
                      y={Number(props.y)}
                      dy={4}
                      fill="var(--text)"
                      fontSize={11}
                      fontFamily="var(--font-geist-mono)"
                      fontWeight={700}
                    >
                      {c.channel.code} {formatCompact(Number(props.value ?? 0))}
                    </text>
                  ) : (
                    <g key={props.index} />
                  )
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      </div>
    </WidgetCard>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  channels,
  fmt,
}: TooltipContentProps & { channels: ChannelSummary[]; fmt: (t: number) => string }) {
  if (!active || !payload?.length) return null;
  const t = Number(label);
  return (
    <div className="rounded-lg border border-line-strong bg-surface-2/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 font-medium text-muted">{fmt(t)}</div>
      {channels.map((c) => {
        const entry = payload.find((p) => p.dataKey === c.channel.id);
        if (!entry) return null;
        return (
          <div key={c.channel.id} className="flex items-center justify-between gap-4">
            <ChannelCode channel={c.channel} size="sm" />
            <span className="num font-semibold text-ink">{formatSigned(Number(entry.value))}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Platzhalter, solange es noch keine gespeicherten Schnappschüsse gibt (Phase 2). */
function NoHistoryYet() {
  return (
    <WidgetCard title="Rennverlauf" subtitle="Gewonnene Aufrufe und Abos über die Zeit">
      <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong px-6 text-center">
        <svg viewBox="0 0 120 40" className="h-12 w-36 text-muted" aria-hidden>
          <path d="M2 36 C30 34, 40 20, 60 18 S 95 6, 118 4" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 5" />
        </svg>
        <p className="text-sm font-medium text-ink">Die Kurven starten mit der Datenbank</p>
        <p className="max-w-md text-xs text-muted">
          YouTube liefert immer nur den aktuellen Stand. Für den Rennverlauf speichert die Datenbank
          alle 15 Minuten einen Schnappschuss – ab dem zweiten erscheinen hier die ersten Kurven,
          nach 24 Stunden das volle Duell.
        </p>
      </div>
    </WidgetCard>
  );
}
