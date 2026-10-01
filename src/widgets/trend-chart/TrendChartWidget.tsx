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
import type { ChannelSummary } from "@/lib/data/types";
import { formatClock, formatCompact, formatDayClock, formatSigned } from "@/lib/format";

type Metric = "views" | "subscribers";
type Range = "24h" | "7d";

interface Row {
  t: number;
  [channelId: string]: number;
}

function buildRows(channels: ChannelSummary[], metric: Metric, range: Range): Row[] {
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

export function TrendChartWidget() {
  const { data } = useDashboardData();
  const [metric, setMetric] = useState<Metric>("views");
  const [range, setRange] = useState<Range>("24h");

  // Nur neu berechnen, wenn ein neuer Schnappschuss da ist (sonst startet die Animation ständig neu).
  const snapshotKey = data.lastSnapshotAt;
  const channels = data.channels;
  const rows = useMemo(
    () => buildRows(channels, metric, range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshotKey, metric, range],
  );
  const lastIndex = rows.length - 1;

  return (
    <WidgetCard
      title="Rennverlauf"
      subtitle={
        metric === "views"
          ? "Gewonnene Aufrufe seit Beginn des Zeitraums"
          : "Gewonnene Abos seit Beginn des Zeitraums (öffentlich gerundet → Stufen)"
      }
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
          <SegmentedControl
            label="Zeitraum"
            value={range}
            onChange={setRange}
            options={[
              { value: "24h", label: "24h" },
              { value: "7d", label: "7 Tage" },
            ]}
          />
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
              tickFormatter={(t: number) => (range === "24h" ? formatClock(t) : formatDayClock(t))}
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
              width={56}
            />
            <Tooltip
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
              content={(props) => <ChartTooltip {...props} channels={channels} range={range} />}
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
  range,
}: TooltipContentProps & { channels: ChannelSummary[]; range: Range }) {
  if (!active || !payload?.length) return null;
  const t = Number(label);
  return (
    <div className="rounded-lg border border-line-strong bg-surface-2/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 font-medium text-muted">{range === "24h" ? formatClock(t) : formatDayClock(t)}</div>
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
