"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { ChannelConfig } from "@/config/channels";
import type { ChannelAnalytics, TimeRange } from "@/lib/data/types";
import { totalsFromDaily } from "@/lib/metrics/analytics";
import { useTimeRange } from "@/components/dashboard/TimeRange";
import {
  formatCompact,
  formatDuration,
  formatIsoDayShort,
  formatNumber,
  formatPercentValue,
  formatShare,
  formatSigned,
} from "@/lib/format";

const RANGE_DAYS: Partial<Record<TimeRange, number>> = { "24h": 1, "7d": 7, "28d": 28 };

export function AnalyticsOverviewWidget() {
  const { data } = useDashboardData();
  const { range } = useTimeRange();
  if (!data.analytics) return null;
  const byId = new Map(data.analytics.map((a) => [a.channelId, a]));
  const lastDay = data.analytics.map((a) => a.lastDay).filter(Boolean).sort().at(-1);
  // Globaler Zeitraum: 24h = letzter gemeldeter Tag, Gesamt = alle geladenen Tage (bis 40)
  const maxDays = Math.max(0, ...data.analytics.map((a) => a.daily.length));
  const days = RANGE_DAYS[range] ?? maxDays;
  const title =
    range === "24h" ? "Analytics · letzter Tag" : range === "all" ? `Analytics · letzte ${maxDays} Tage` : `Analytics · letzte ${days} Tage`;

  return (
    <WidgetCard
      title={title}
      subtitle={
        lastDay
          ? `Exakte Werte von YouTube Analytics · Stand ${formatIsoDayShort(lastDay)} (1–2 Tage Verzögerung)`
          : "Exakte Werte von YouTube Analytics (1–2 Tage Verzögerung)"
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {data.channels.map((c) => (
          <ChannelAnalyticsCard key={c.channel.id} channel={c.channel} analytics={byId.get(c.channel.id)} days={days} />
        ))}
      </div>
    </WidgetCard>
  );
}

function ChannelAnalyticsCard({
  channel,
  analytics,
  days,
}: {
  channel: ChannelConfig;
  analytics?: ChannelAnalytics;
  days: number;
}) {
  const header = (
    <div className="mb-3 flex items-center gap-2">
      <span className="h-4 w-1.5 rounded-[2px]" style={{ backgroundColor: channel.color }} aria-hidden />
      <span className="font-semibold text-ink">{channel.name}</span>
    </div>
  );

  if (!analytics?.connected) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong p-4">
        {header}
        <p className="text-sm text-ink-2">Noch nicht mit YouTube Analytics verbunden.</p>
        <a href="/settings" className="mt-3 inline-block rounded-lg bg-live px-3 py-2 text-xs font-semibold text-white">
          Kanal verbinden →
        </a>
      </div>
    );
  }

  const t = totalsFromDaily(analytics.daily, days);
  return (
    <div className="rounded-xl border border-line bg-bg/40 p-4">
      {header}
      {analytics.error ? (
        <p className="mb-3 text-xs text-sector-worse">
          ⚠ {analytics.error}{" "}
          <a href="/settings" className="underline">
            Einstellungen
          </a>
        </p>
      ) : null}
      {!t ? (
        <p className="text-sm text-muted">Die ersten Daten werden gerade abgerufen …</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Kpi
              label="Abos netto"
              value={formatSigned(t.subsNet)}
              sub={`+${formatNumber(t.subsGained)} / −${formatNumber(t.subsLost)}`}
            />
            <Kpi label="Aufrufe" value={formatCompact(t.views)} sub={`${formatCompact(t.views / Math.max(1, t.days))} pro Tag`} />
            <Kpi
              label="Engaged Views"
              value={t.engagedViews === null ? "–" : formatCompact(t.engagedViews)}
              sub={t.engagedViews === null ? "nicht verfügbar" : `${formatShare(t.engagedViews / Math.max(1, t.views))} der Aufrufe`}
            />
            <Kpi label="Watchtime" value={`${formatCompact(t.minutesWatched / 60)} Std.`} sub="geschaute Stunden" />
            <Kpi label="Ø Wiedergabe" value={formatDuration(t.avgViewSec)} sub="Minuten:Sekunden" />
            <Kpi label="Ø angesehen" value={formatPercentValue(t.avgViewPct)} sub="Zuschauerbindung" />
          </dl>
          <SubsChart analytics={analytics} color={channel.color} days={Math.max(7, days)} />
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className="num mt-0.5 truncate text-xl font-semibold text-ink">{value}</dd>
      <dd className="truncate text-[11px] text-muted">{sub}</dd>
    </div>
  );
}

/** Abo-Gewinn netto pro Tag (im Zeitraum, mindestens 7 Tage). */
function SubsChart({ analytics, color, days }: { analytics: ChannelAnalytics; color: string; days: number }) {
  const rows = analytics.daily.slice(-days).map((d) => ({ day: d.day, net: d.subsGained - d.subsLost }));
  if (rows.length < 2) return null;
  return (
    <div className="mt-4">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">Abos netto pro Tag</p>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 400, height: 96 }}>
          <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={2}>
            <XAxis dataKey="day" hide />
            <YAxis hide domain={[(min: number) => Math.min(0, min), "dataMax"]} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.06)" }}
              content={(p: TooltipContentProps) =>
                p.active && p.payload?.length ? (
                  <div className="rounded-lg border border-line-strong bg-surface-2/95 px-2.5 py-1.5 text-xs shadow-xl">
                    <span className="text-muted">{formatIsoDayShort(String(p.label))}</span>{" "}
                    <b className="num text-ink">{formatSigned(Number(p.payload[0].value))}</b>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="net" fill={color} radius={[3, 3, 0, 0]} isAnimationActive />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
