"use client";

import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import {
  useDashboardData,
  useLiveChannel,
} from "@/components/dashboard/DashboardDataProvider";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import type { ChannelSummary } from "@/lib/data/types";
import { formatSigned } from "@/lib/format";
import { channelGain, type ChannelGain } from "@/lib/metrics/range";
import { useTimeRange } from "@/components/dashboard/TimeRange";

export function ChannelOverviewWidget() {
  const { data } = useDashboardData();
  const { range } = useTimeRange();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {data.channels.map((c) => (
        <ChannelCard
          key={c.channel.id}
          summary={c}
          hasHistory={data.hasHistory}
          gain={channelGain(
            c,
            data.analytics?.find((a) => a.channelId === c.channel.id),
            range,
            data.historyHours,
          )}
        />
      ))}
    </div>
  );
}

function ChannelCard({
  summary,
  hasHistory,
  gain,
}: {
  summary: ChannelSummary;
  hasHistory: boolean;
  gain: ChannelGain;
}) {
  const live = useLiveChannel(summary);
  const { channel, current, subscribersRounded } = summary;
  // Gesamt-Ansicht: die großen Zahlen SIND schon der Gesamtstand → keine Zusatzzeile
  const showDelta = gain.effective !== "all";
  // 24h/7 Tage laufen live hochgerechnet weiter (28 Tage = Analytics, fester Stand)
  const liveExtra = gain.effective === "24h" || gain.effective === "7d" ? live.views - current.views : 0;
  const windowLabel = gain.label;

  // Aufrufe pro Stunde über die letzten 7 Tage (für die kleine Kurve im Hintergrund).
  const spark = summary.history7d.slice(1).map((p, i) => ({
    t: p.t,
    v: Math.max(0, p.views - summary.history7d[i].views),
  }));

  return (
    <article className="relative overflow-hidden rounded-2xl border border-line bg-surface/80 backdrop-blur">
      <div className="h-1 w-full" style={{ backgroundColor: channel.color }} />

      {/* Kleine 7-Tage-Kurve als Hintergrund (nur mit Verlauf) */}
      {hasHistory ? (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 opacity-40"
          aria-hidden
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 400, height: 96 }}
          >
            <AreaChart
              data={spark}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient
                  id={`spark-${channel.code}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={channel.color}
                    stopOpacity={0.5}
                  />
                  <stop
                    offset="100%"
                    stopColor={channel.color}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <YAxis hide domain={[0, "dataMax"]} />
              <Area
                type="monotone"
                dataKey="v"
                stroke={channel.color}
                strokeWidth={1.5}
                fill={`url(#spark-${channel.code})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="relative p-5">
        <div className="mb-5 flex items-center gap-3">
          <ChannelAvatar channel={channel} url={summary.avatarUrl} size={44} rounded="rounded-xl" />
          <div>
            <h3 className="text-lg font-semibold leading-tight text-ink">
              {channel.name}
            </h3>
            <p className="text-xs text-muted">Eigener Kanal · Shorts</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
          <Stat
            label="Abonnenten"
            hint={subscribersRounded ? "öffentlich gerundet" : undefined}
            value={<AnimatedNumber value={current.subscribers} />}
            delta={!showDelta ? undefined : hasHistory || gain.effective === "28d" ? gain.subscribers : null}
            windowLabel={windowLabel}
          />
          <Stat
            label="Aufrufe gesamt"
            hint={live.isEstimated ? "≈ live hochgerechnet" : undefined}
            value={<AnimatedNumber value={live.views} format="compact" />}
            title={Math.round(live.views).toLocaleString("de-DE")}
            delta={!showDelta ? undefined : hasHistory || gain.effective === "28d" ? (gain.views === null ? null : gain.views + liveExtra) : null}
            windowLabel={windowLabel}
          />
          <Stat
            label="Shorts"
            value={<AnimatedNumber value={current.videoCount} />}
            delta={!showDelta || (gain.videos === null && gain.effective === "28d") ? undefined : hasHistory ? gain.videos : null}
            windowLabel={windowLabel}
          />
        </dl>
        {gain.note ? <p className="mt-3 text-[10px] text-muted">{gain.note}</p> : null}
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  delta,
  hint,
  title,
  windowLabel = "in 24h",
}: {
  label: string;
  value: React.ReactNode;
  /** null = noch kein Wert verfügbar, undefined = keine Zusatzzeile. */
  delta?: number | null;
  hint?: string;
  title?: string;
  windowLabel?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd
        className="mt-1 truncate text-2xl font-semibold text-ink sm:text-3xl"
        title={title}
      >
        {value}
      </dd>
      <dd className="mt-1 text-xs text-ink-2">
        {delta === undefined ? null : delta === null ? (
          <span className="text-muted">Wert folgt</span>
        ) : (
          <>
            <span className="num font-semibold">
              {formatSigned(delta, Math.abs(delta) >= 10_000)}
            </span>{" "}
            <span className="text-muted">{windowLabel}</span>
          </>
        )}
      </dd>
      {hint ? <dd className="mt-0.5 text-[10px] text-muted">{hint}</dd> : null}
    </div>
  );
}
