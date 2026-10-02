"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useDashboardData, useNow } from "@/components/dashboard/DashboardDataProvider";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ChannelCode } from "@/components/ui/ChannelCode";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { APP_CONFIG } from "@/config/app";
import type { ChannelConfig } from "@/config/channels";
import type { RankedShort, RankingPeriod } from "@/lib/data/types";
import { formatAgo, formatCompact, formatDuration, formatNumber, formatWindowLabel, noHistoryHint } from "@/lib/format";
import { metricFor, rankShorts } from "@/lib/metrics/ranking";
import { ShortLink } from "@/components/ui/ShortLink";
import { ShortThumb } from "@/components/ui/ShortThumb";
import { RangeNote, useTimeRange } from "@/components/dashboard/TimeRange";

const PERIOD_LABEL: Record<RankingPeriod, string> = {
  "24h": "Aufrufe 24h",
  "7d": "Aufrufe 7 Tage",
  "28d": "Aufrufe 28 Tage (YouTube Analytics)",
  all: "Aufrufe gesamt",
};

export function TopShortsWidget() {
  const { data } = useDashboardData();
  const now = useNow();
  const { range } = useTimeRange();
  // Globaler Zeitraum – mit ehrlichem Rückfall, wenn ein Zeitraum (noch) nicht geht.
  let period: RankingPeriod = range;
  let note: string | null = null;
  if (!data.hasHistory && (range === "24h" || range === "7d")) {
    period = "all";
    note = `${range === "24h" ? "24h" : "7 Tage"} ${noHistoryHint(data.source)} – zeigt Gesamt`;
  } else if (range === "28d" && data.topShorts["28d"].length === 0) {
    period = data.hasHistory ? "7d" : "all";
    note = `28 Tage nur mit YouTube Analytics – zeigt ${period === "7d" ? "7 Tage" : "Gesamt"}`;
  }
  // Weniger gemessen als der Zeitraum lang ist → ehrlich „seit …“ dazuschreiben.
  const windowHours = period === "24h" ? 24 : period === "7d" ? 168 : 0;
  const subtitle =
    windowHours > 0 && data.historyHours < windowHours
      ? `${PERIOD_LABEL[period]} · gemessen ${formatWindowLabel(data.historyHours, windowHours)}`
      : PERIOD_LABEL[period];
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const channels = data.channels.map((c) => c.channel);
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const pool = data.topShorts[period].filter(
    (s) => channelFilter === "all" || s.channelId === channelFilter,
  );
  const list = rankShorts(pool, period, APP_CONFIG.topShortsLimit);
  const leader = list[0] ? metricFor(list[0], period) : 0;

  return (
    <WidgetCard
      title="Top Shorts"
      subtitle={subtitle}
      actions={
        <>
          <SegmentedControl
            label="Kanal"
            value={channelFilter}
            onChange={setChannelFilter}
            options={[
              { value: "all", label: "Alle" },
              ...channels.map((c) => ({ value: c.id, label: c.code })),
            ]}
          />
          {note ? <RangeNote>{note}</RangeNote> : null}
        </>
      }
    >
      <ol className="grid grid-cols-1 gap-x-6 gap-y-1 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-5">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((s, i) => (
            <ShortRow
              key={s.id}
              short={s}
              position={i + 1}
              value={metricFor(s, period)}
              share={leader ? metricFor(s, period) / leader : 0}
              period={period}
              channel={channelById.get(s.channelId)}
              now={now}
              linkable={data.source !== "youtube"}
              hasHistory={data.hasHistory}
              windowLabel={formatWindowLabel(data.historyHours)}
            />
          ))}
        </AnimatePresence>
      </ol>
      {list.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Keine Shorts in diesem Zeitraum.</p>
      ) : null}
    </WidgetCard>
  );
}

function ShortRow({
  short,
  position,
  value,
  share,
  period,
  channel,
  now,
  linkable,
  hasHistory,
  windowLabel,
}: {
  short: RankedShort;
  position: number;
  value: number;
  share: number;
  period: RankingPeriod;
  channel: ChannelConfig | undefined;
  now: number;
  linkable: boolean;
  hasHistory: boolean;
  windowLabel: string;
}) {
  const color = channel?.color ?? "var(--muted)";
  const secondary =
    period !== "all"
      ? `${formatCompact(short.views)} gesamt`
      : hasHistory
        ? `+${formatCompact(short.views24h)} ${windowLabel}`
        : short.likes > 0
          ? `${formatCompact(short.likes)} Likes`
          : "";

  const content = (
    <>
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded font-mono text-xs font-black ${
          position === 1 ? "bg-ink text-bg" : "bg-surface-3 text-ink"
        }`}
      >
        {position}
      </span>

      <ShortThumb
        src={short.thumbnailUrl}
        color={color}
        preview={{
          title: short.title,
          lines: [
            `${formatNumber(short.views)} Aufrufe gesamt`,
            ...(hasHistory ? [`+${formatNumber(short.views24h)} ${windowLabel}`] : []),
            `${formatNumber(short.likes)} Likes · ${formatDuration(short.durationSec)}`,
          ],
        }}
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink" title={short.title}>
          {short.title}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
          {channel ? <ChannelCode channel={channel} size="sm" /> : null}
          <span>{formatAgo(short.publishedAt, now)}</span>
          <span aria-hidden>·</span>
          <span className="num">{formatDuration(short.durationSec)}</span>
        </span>
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <motion.span
            className="block h-full rounded-full"
            style={{ backgroundColor: color }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(2, share * 100)}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block font-mono text-sm font-semibold text-ink">
          <AnimatedNumber value={value} format="compact" countUp={false} />
        </span>
        <span className="block text-[10px] text-muted">{secondary}</span>
      </span>
    </>
  );

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 350, damping: 32 }}
      className="border-b border-line last:border-b-0 lg:[&:nth-child(5)]:border-b-0"
    >
      {linkable ? (
        <ShortLink
          id={short.id}
          className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-surface-2"
        >
          {content}
        </ShortLink>
      ) : (
        <div className="flex items-center gap-3 px-1 py-2">{content}</div>
      )}
    </motion.li>
  );
}
