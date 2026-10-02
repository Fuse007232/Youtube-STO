"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { StandingsEntry } from "@/lib/data/types";
import { formatCompact, formatNumber, formatSigned, formatWindowLabel } from "@/lib/format";
import { HOUR_MS } from "@/lib/metrics/deltas";
import {
  sortStandings,
  standingsValue,
  standingsViews,
  type StandingsMetric,
  type StandingsRange,
} from "@/lib/metrics/standings";
import { RangeNote, useTimeRange } from "@/components/dashboard/TimeRange";
import { ShortLink } from "@/components/ui/ShortLink";
import { ShortThumb } from "@/components/ui/ShortThumb";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";

const METRICS: { value: StandingsMetric; label: string; long: string }[] = [
  { value: "views", label: "Aufrufe", long: "Aufrufe im Zeitraum" },
  { value: "subscribers", label: "Abos", long: "Abonnenten (öffentlich gerundet)" },
  { value: "pace", label: "Tempo", long: "Aufrufe pro Stunde (zuletzt)" },
  { value: "avgPerShort", label: "Ø pro Short", long: "Ø Aufrufe der Shorts aus den letzten 30 Tagen" },
  { value: "uploads7d", label: "Uploads", long: "Hochgeladene Shorts in den letzten 7 Tagen" },
];

/** Wie viele Stunden Verlauf dieser Kanal hat (neu hinzugefügte Konkurrenten haben weniger). */
function historyHoursOf(e: StandingsEntry): number {
  const h = e.summary.history24h;
  return h.length > 1 ? (h[h.length - 1].t - h[0].t) / HOUR_MS : 0;
}

export function StandingsWidget() {
  const { data } = useDashboardData();
  const [metric, setMetric] = useState<StandingsMetric>("views");
  const { range: globalRange } = useTimeRange();
  if (!data.standings) return null;
  // 28 Tage gibt es für Konkurrenten nicht (kein Analytics) → fair für alle 7 Tage
  const range: StandingsRange = globalRange === "28d" ? "7d" : globalRange;
  const rangeText = range === "24h" ? "24h" : range === "7d" ? "7 Tage" : "gesamt";

  const rows = sortStandings(data.standings, metric, range);
  const leader = rows[0] ? standingsValue(rows[0], metric, range) : 0;
  const hasRivals = rows.some((r) => !r.isOwn);
  const current = METRICS.find((m) => m.value === metric)!;
  const big = metric === "views" || metric === "subscribers" || metric === "pace" || metric === "avgPerShort";

  return (
    <WidgetCard
      title="Fahrerwertung"
      subtitle={`${metric === "views" ? `Aufrufe ${rangeText}` : current.long} · deine Kanäle gegen die Konkurrenz`}
      actions={
        <>
        {globalRange === "28d" ? <RangeNote>28 Tage nur für eigene Kanäle – alle auf 7 Tagen</RangeNote> : null}
        <SegmentedControl
          label="Wertung nach"
          value={metric}
          onChange={setMetric}
          options={METRICS.map((m) => ({ value: m.value, label: m.label }))}
        />
        </>
      }
    >
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[2rem_minmax(10rem,1.6fr)_1fr_repeat(4,minmax(4.5rem,0.8fr))_minmax(9rem,1.4fr)] gap-x-3 px-2 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted">
            <span>Pos</span>
            <span>Kanal</span>
            <span className="text-right">{current.label}</span>
            <span className="text-right">Abos</span>
            <span className="text-right">Aufrufe {rangeText}</span>
            <span className="text-right">Tempo/Std.</span>
            <span className="text-right">Ø/Short</span>
            <span>Bester Short 24h</span>
          </div>
          <ol className="space-y-1">
            {rows.map((e, i) => {
              const value = standingsValue(e, metric, range);
              const hours = historyHoursOf(e);
              return (
                <motion.li
                  key={e.summary.channel.id}
                  layout
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                  className={`grid grid-cols-[2rem_minmax(10rem,1.6fr)_1fr_repeat(4,minmax(4.5rem,0.8fr))_minmax(9rem,1.4fr)] items-center gap-x-3 rounded-lg border px-2 py-2 ${
                    e.isOwn ? "border-line-strong bg-surface-2/80" : "border-line bg-bg/40"
                  }`}
                >
                  <span
                    className={`grid h-6 w-6 place-items-center rounded font-mono text-xs font-black ${
                      i === 0 ? "bg-ink text-bg" : "bg-surface-3 text-ink"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <ChannelAvatar channel={e.summary.channel} url={e.summary.avatarUrl} size={24} />
                    <span className="font-mono text-xs font-bold tracking-wider text-ink">{e.summary.channel.code}</span>
                    <span className="truncate text-sm text-ink-2" title={e.summary.channel.name}>
                      {e.summary.channel.name}
                    </span>
                    {e.isOwn ? (
                      <span className="shrink-0 rounded bg-live/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                        Du
                      </span>
                    ) : null}
                  </span>
                  <span className="text-right font-mono text-sm font-semibold text-ink">
                    <AnimatedNumber value={value} format={big ? "compact" : "number"} countUp={false} />
                    <span className="block text-[10px] font-normal text-muted">
                      {i === 0 ? "führt" : formatSigned(value - leader, big)}
                      {metric === "views" && range === "24h" && hours < 24 ? ` · ${formatWindowLabel(hours)}` : ""}
                    </span>
                  </span>
                  <span className="num text-right text-xs text-ink-2">{formatCompact(e.summary.current.subscribers)}</span>
                  <span className="num text-right text-xs text-ink-2">
                    {formatCompact(standingsViews(e, range))}
                  </span>
                  <span className="num text-right text-xs text-ink-2">
                    {formatCompact(e.summary.rate.viewsPerSecond * 3600)}
                  </span>
                  <span className="num text-right text-xs text-ink-2">
                    {e.avgViewsPerShort30d === null ? "–" : formatCompact(e.avgViewsPerShort30d)}
                    <span className="block text-[10px] text-muted">{formatNumber(e.uploads7d)} in 7T</span>
                  </span>
                  <span className="min-w-0 text-xs">
                    {e.bestShort24h ? (
                      <ShortLink
                        id={e.bestShort24h.id}
                        className="flex min-w-0 items-center gap-2 text-ink-2 hover:text-ink"
                        title={e.bestShort24h.title}
                      >
                        <ShortThumb
                          src={e.bestShort24h.thumbnailUrl}
                          color={e.summary.channel.color}
                          className="h-8 w-[18px]"
                          preview={{ title: e.bestShort24h.title, lines: [`+${formatNumber(e.bestShort24h.views24h)} Aufrufe in 24h`] }}
                        />
                        <span className="min-w-0 truncate">
                          <span className="num font-semibold text-ink">+{formatCompact(e.bestShort24h.views24h)}</span>{" "}
                          {e.bestShort24h.title}
                        </span>
                      </ShortLink>
                    ) : (
                      <span className="text-muted">–</span>
                    )}
                  </span>
                </motion.li>
              );
            })}
          </ol>
        </div>
      </div>
      {!hasRivals ? (
        <p className="mt-3 rounded-lg border border-dashed border-line-strong p-3 text-center text-xs text-muted">
          Noch keine Konkurrenz eingetragen.{" "}
          <a href="/settings#konkurrenz" className="text-ink-2 underline">
            Jetzt Kanäle hinzufügen
          </a>
        </p>
      ) : null}
    </WidgetCard>
  );
}
