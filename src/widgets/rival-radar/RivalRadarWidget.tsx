"use client";

import { motion } from "motion/react";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { ChannelCode } from "@/components/ui/ChannelCode";
import { ShortThumb } from "@/components/ui/ShortThumb";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { formatAgo, formatCompact, formatOneDecimal } from "@/lib/format";
import { RADAR } from "@/lib/metrics/radar";

/** Konkurrenz-Radar: Was geht bei der Konkurrenz gerade ab? */
export function RivalRadarWidget() {
  const { data } = useDashboardData();
  const radar = data.rivalRadar;
  if (radar === null) return null;
  const rivals = (data.standings ?? []).filter((e) => !e.isOwn).map((e) => e.summary.channel);
  const channelOf = new Map(rivals.map((c) => [c.id, c]));
  const now = data.generatedAt;

  return (
    <WidgetCard
      title="Konkurrenz-Radar"
      subtitle={`Konkurrenz-Shorts, die mind. ${formatOneDecimal(RADAR.minFactor)}× so stark laufen wie üblich – Ideen-Quelle.`}
    >
      {rivals.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Noch keine Konkurrenten eingetragen.{" "}
          <a href="/settings#konkurrenz" className="text-ink-2 underline">
            Jetzt hinzufügen
          </a>
        </p>
      ) : radar.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Ruhige Strecke: Gerade geht bei der Konkurrenz nichts Ungewöhnliches ab.</p>
      ) : (
        <ol className="divide-y divide-line">
          {radar.map((r, i) => {
            const ch = channelOf.get(r.channelId);
            const hot = r.factor >= 5;
            return (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <a href={`/short/${r.id}`} className="flex items-center gap-3 py-2 hover:bg-surface-2/60">
                  <ShortThumb src={r.thumbnailUrl} color={ch?.color ?? "#555"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink" title={r.title}>
                      {r.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      {ch ? <ChannelCode channel={ch} size="sm" /> : null}
                      <span
                        className="rounded border border-line px-1 text-[10px] uppercase tracking-wider text-ink-2"
                        title={
                          r.kind === "new"
                            ? "Neu: hat jetzt schon so viele Aufrufe wie ein üblicher Short insgesamt × Faktor"
                            : "Ausbruch: älterer Short, der in 24 Std. viel mehr holt als üblich"
                        }
                      >
                        {r.kind === "new" ? "neu" : "Ausbruch"}
                      </span>
                      <span>{formatAgo(r.publishedAt, now)}</span>
                      <span className="num">· {formatCompact(r.perHour)}/Std.</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className="num inline-block rounded-md px-1.5 py-0.5 text-xs font-bold text-ink"
                      style={{
                        background: `color-mix(in srgb, var(${hot ? "--sector-best" : "--sector-improved"}) 45%, transparent)`,
                      }}
                      title={r.kind === "new" ? "Aufrufe insgesamt im Vergleich zum üblichen Endstand dieses Kanals" : "Aufrufe in 24 Std. im Vergleich zum Üblichen dieses Kanals"}
                    >
                      {formatOneDecimal(r.factor)}×
                    </span>
                    <span className="num mt-0.5 block text-[11px] text-ink-2">+{formatCompact(r.views24h)}</span>
                  </span>
                </a>
              </motion.li>
            );
          })}
        </ol>
      )}
    </WidgetCard>
  );
}
