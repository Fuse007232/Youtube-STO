"use client";

import { motion } from "motion/react";
import { useDashboardData, useLiveChannels } from "@/components/dashboard/DashboardDataProvider";
import { AnimatedNumber, type NumberFormat } from "@/components/ui/AnimatedNumber";
import { LiveDot } from "@/components/ui/LiveDot";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { ChannelConfig } from "@/config/channels";
import type { ChannelSummary } from "@/lib/data/types";
import { formatClock, formatSigned, formatWindowLabel, noHistoryHint } from "@/lib/format";
import { sectorStatus, type SectorStatus } from "@/lib/metrics/sector";
import { channelGain, rangeLabel } from "@/lib/metrics/range";
import { useTimeRange } from "@/components/dashboard/TimeRange";

interface Entry {
  channel: ChannelConfig;
  value: number;
  status: SectorStatus;
}

const SECTOR: Record<SectorStatus, { color: string; label: string }> = {
  best: { color: "var(--sector-best)", label: "Bestwert" },
  improved: { color: "var(--sector-improved)", label: "besser als Vortag" },
  worse: { color: "var(--sector-worse)", label: "schwächer als Vortag" },
  neutral: { color: "var(--sector-neutral)", label: "kein Vergleich" },
};

export function DuelTowerWidget() {
  const { data } = useDashboardData();
  const rows = useLiveChannels();

  const views: Entry[] = rows.map(({ summary: s, live }) => ({
    channel: s.channel,
    value: live.views24h,
    status: sectorStatus(s.delta24h.views, s.prevDelta24h?.views ?? null, s.best24h?.views ?? null),
  }));
  const subs: Entry[] = rows.map(({ summary: s }) => ({
    channel: s.channel,
    value: s.delta24h.subscribers,
    status: sectorStatus(
      s.delta24h.subscribers,
      s.prevDelta24h?.subscribers ?? null,
      s.best24h?.subscribers ?? null,
    ),
  }));
  const uploads: Entry[] = rows.map(({ summary: s }) => ({
    channel: s.channel,
    value: s.delta24h.videos,
    status: sectorStatus(s.delta24h.videos, s.prevDelta24h?.videos ?? null, null),
  }));
  const pace: Entry[] = rows.map(({ summary: s, live }) => ({
    channel: s.channel,
    value: live.viewsPerHour,
    status: "neutral",
  }));

  const { range } = useTimeRange();
  // Ohne Verlauf oder „Gesamt“ gewählt: Duell über die Gesamtwerte.
  const totalsMode = !data.hasHistory || range === "all";
  // 7 bzw. 28 Tage: Gewinne im Zeitraum (28 Tage aus YouTube Analytics)
  const windowMode = !totalsMode && (range === "7d" || range === "28d");
  const gains = rows.map(({ summary: s, live }) => {
    const g = channelGain(s, data.analytics?.find((a) => a.channelId === s.channel.id), range, data.historyHours);
    return { s, g, liveExtra: g.effective === "7d" ? live.views - s.current.views : 0 };
  });
  const g0 = gains[0]?.g;
  const windowLabel = !g0 ? "" : g0.label.startsWith("in ") ? rangeLabel(g0.effective) : g0.label;
  const windowNote = gains.find((x) => x.g.note)?.g.note ?? null;
  // Weniger als 24h gemessen: Gewinne gelten „seit Messbeginn“.
  const partial = data.hasHistory && data.historyHours < 24;
  const fullAt = data.lastSnapshotAt + (24 - data.historyHours) * 3_600_000;
  const sections = totalsMode
    ? [
        {
          title: "Aufrufe gesamt",
          entries: rows.map(({ summary: s, live }) => neutral(s, live.views)),
          format: "compact" as const,
          gapCompact: true,
        },
        {
          title: "Abonnenten",
          note: anyRoundedNote(data.channels),
          entries: rows.map(({ summary: s }) => neutral(s, s.current.subscribers)),
          format: "number" as const,
          gapCompact: false,
        },
        {
          title: "Shorts",
          entries: rows.map(({ summary: s }) => neutral(s, s.current.videoCount)),
          format: "number" as const,
          gapCompact: false,
        },
        {
          title: "Ø Aufrufe pro Short",
          entries: rows.map(({ summary: s }) =>
            neutral(s, s.current.videoCount ? s.current.views / s.current.videoCount : 0),
          ),
          format: "number" as const,
          gapCompact: true,
        },
      ]
    : windowMode
      ? [
          {
            title: "Aufrufe",
            entries: gains.map(({ s, g, liveExtra }) => neutral(s, (g.views ?? 0) + liveExtra)),
            format: "number" as const,
            gapCompact: true,
          },
          {
            title: "Abos",
            note: anyRoundedNote(data.channels),
            entries: gains.map(({ s, g }) => neutral(s, g.subscribers ?? 0)),
            format: "signed" as const,
            gapCompact: false,
          },
          ...(gains.every(({ g }) => g.videos !== null)
            ? [
                {
                  title: "Neue Shorts",
                  entries: gains.map(({ s, g }) => neutral(s, g.videos ?? 0)),
                  format: "number" as const,
                  gapCompact: false,
                },
              ]
            : []),
          { title: "Tempo · Aufrufe/Std.", entries: pace, format: "number" as const, gapCompact: true },
        ]
      : [
        { title: "Aufrufe", entries: views, format: "number" as const, gapCompact: true },
        {
          title: "Abos",
          note: anyRoundedNote(data.channels),
          entries: subs,
          format: "signed" as const,
          gapCompact: false,
        },
        { title: "Neue Shorts", entries: uploads, format: "number" as const, gapCompact: false },
        { title: "Tempo · Aufrufe/Std.", entries: pace, format: "number" as const, gapCompact: true },
      ];

  // Tauziehen-Balken: Anteil an den Aufrufen (24h bzw. gesamt).
  const shareEntries = sections[0].entries;
  const total = shareEntries.reduce((sum, e) => sum + Math.max(0, e.value), 0);

  return (
    <WidgetCard
      title={
        totalsMode
          ? "Duell · Gesamtstand"
          : windowMode
            ? `Duell · ${windowLabel}`
          : partial
            ? `Duell · ${formatWindowLabel(data.historyHours)}`
            : "Duell · Letzte 24h"
      }
      subtitle={
        totalsMode
          ? data.hasHistory
            ? "Echte Gesamtzahlen"
            : `Echte Gesamtzahlen · 24h-Duell ${noHistoryHint(data.source)}`
          : windowMode
            ? (windowNote ?? "Gewinne im gewählten Zeitraum")
          : partial
            ? `Messung läuft · volle 24h ab ${formatClock(fullAt)} Uhr`
            : "Gleitend: die letzten 24 Stunden bis jetzt"
      }
      actions={
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-2">
          <LiveDot /> Live
        </span>
      }
    >
      {/* Anteil an den Aufrufen – wie ein Tauziehen */}
      <div className="mb-4">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3" role="img"
          aria-label={shareEntries.map((e) => `${e.channel.code} ${total ? Math.round((e.value / total) * 100) : 0} Prozent`).join(", ")}
        >
          {shareEntries.map((e, i) => (
            <motion.div
              key={e.channel.id}
              className={i > 0 ? "border-l-2 border-surface" : ""}
              style={{ backgroundColor: e.channel.color }}
              initial={{ width: "50%" }}
              animate={{ width: `${total ? (Math.max(0, e.value) / total) * 100 : 50}%` }}
              transition={{ type: "spring", stiffness: 80, damping: 20 }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-ink-2">
          {shareEntries.map((e) => (
            <span key={e.channel.id} className="num">
              {e.channel.code} {total ? Math.round((Math.max(0, e.value) / total) * 100) : 0}%
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {sections.map((sec) => (
          <TowerSection key={sec.title} {...sec} />
        ))}
      </div>

      {totalsMode || windowMode ? null : (
      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-muted">
        {(["best", "improved", "worse"] as const).map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: SECTOR[s].color }} />
            {s === "best" ? "Bestwert (gespeicherter Verlauf)" : SECTOR[s].label}
          </li>
        ))}
      </ul>
      )}
    </WidgetCard>
  );
}

function neutral(s: ChannelSummary, value: number): Entry {
  return { channel: s.channel, value, status: "neutral" };
}

function anyRoundedNote(channels: ChannelSummary[]): string | undefined {
  return channels.some((c) => c.subscribersRounded) ? "öffentlich gerundet" : undefined;
}

function TowerSection({
  title,
  note,
  entries,
  format,
  gapCompact = false,
}: {
  title: string;
  note?: string;
  entries: Entry[];
  format: NumberFormat;
  gapCompact?: boolean;
}) {
  // Sortieren: Höchster Wert = P1. Bei Gleichstand bleibt die Reihenfolge aus der Konfiguration.
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const leader = sorted[0]?.value ?? 0;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h3 className="f1-heading text-[11px] text-muted">{title}</h3>
        {note ? <span className="text-[10px] text-muted">{note}</span> : null}
      </div>
      <ol className="overflow-hidden rounded-lg border border-line bg-bg/40">
        {sorted.map((e, i) => {
          const gap = e.value - leader;
          return (
            <motion.li
              key={e.channel.id}
              layout
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="grid grid-cols-[1.75rem_auto_1fr_auto_auto] items-center gap-2 border-b border-line px-2 py-1.5 last:border-b-0"
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded font-mono text-xs font-black ${
                  i === 0 ? "bg-ink text-bg" : "bg-surface-3 text-ink"
                }`}
              >
                {i + 1}
              </span>
              <span className="h-5 w-1 rounded-[2px]" style={{ backgroundColor: e.channel.color }} aria-hidden />
              <span className="min-w-0 truncate font-mono text-sm font-bold tracking-wider text-ink" title={e.channel.name}>
                {e.channel.code}
              </span>
              <span className="text-right font-mono text-sm font-semibold text-ink">
                <AnimatedNumber value={e.value} format={format} />
                <span className="block text-[10px] font-normal text-muted">
                  {i === 0 ? (entries.length > 1 ? "führt" : "") : formatSigned(gap, gapCompact)}
                </span>
              </span>
              <span
                className="h-6 w-1.5 rounded-[2px]"
                style={{ backgroundColor: SECTOR[e.status].color }}
                title={SECTOR[e.status].label}
              >
                <span className="sr-only">{SECTOR[e.status].label}</span>
              </span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
