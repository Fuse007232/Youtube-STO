"use client";

import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { ChannelCode } from "@/components/ui/ChannelCode";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { RangeNote, useTimeRange } from "@/components/dashboard/TimeRange";
import { formatAgo, formatCompact, formatShare, formatWindowLabel, noHistoryHint } from "@/lib/format";
import { ShortLink } from "@/components/ui/ShortLink";
import { ShortThumb } from "@/components/ui/ShortThumb";

type Win = "24h" | "7d";
/** Neueste Shorts = volle Kanalfarbe, je älter desto blasser. */
const AGE_ALPHA = [100, 72, 50, 32, 18];

/** „Reifenverschleiß“: Wie viel holen neue Shorts, wie viel der Katalog? */
export function CatalogShareWidget() {
  const { data } = useDashboardData();
  const now = data.generatedAt;
  const { range } = useTimeRange();
  // Nach Alter aufgeteilt gibt es nur 24h und 7 Tage (aus den Schnappschüssen)
  const win: Win = range === "24h" ? "24h" : "7d";
  const note = range === "28d" || range === "all" ? "zeigt 7 Tage (länger wird nicht nach Alter gemessen)" : null;
  const catalog = data.catalog;
  const label = formatWindowLabel(data.historyHours, win === "24h" ? 24 : 168);

  return (
    <WidgetCard
      title="Reifenverschleiß · Neu vs. Katalog"
      subtitle={`Woher kommen die Aufrufe ${label}? Nach Alter der Shorts.`}
      actions={note ? <RangeNote>{note}</RangeNote> : undefined}
    >
      {!catalog ? (
        <p className="py-8 text-center text-sm text-muted">Verfügbar {noHistoryHint(data.source)}.</p>
      ) : (
        <div className="space-y-5">
          {catalog.map((c) => {
            const channel = data.channels.find((x) => x.channel.id === c.channelId)?.channel;
            if (!channel) return null;
            const w = win === "24h" ? c.window24h : c.window7d;
            return (
              <div key={c.channelId}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <ChannelCode channel={channel} />
                  <span className="text-xs text-ink-2">
                    Katalog (älter als 7 Tage):{" "}
                    <b className="num text-sm text-ink">{w.totalViews > 0 ? formatShare(w.catalogShare) : "–"}</b>
                  </span>
                </div>
                {w.totalViews > 0 ? (
                  <>
                    <div className="flex h-5 overflow-hidden rounded-md bg-surface-2" role="img" aria-label="Aufrufe nach Alter">
                      {w.buckets.map((b, i) =>
                        b.share > 0 ? (
                          <span
                            key={b.label}
                            title={`${b.label}: ${formatCompact(b.views)} Aufrufe (${formatShare(b.share)}, ${b.shorts} Shorts)`}
                            className="h-full border-r border-bg/60 last:border-r-0"
                            style={{
                              width: `${b.share * 100}%`,
                              background: `color-mix(in srgb, ${channel.color} ${AGE_ALPHA[i]}%, transparent)`,
                            }}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                      {w.buckets.map((b, i) => (
                        <span key={b.label} className="inline-flex items-center gap-1">
                          <span
                            className="inline-block h-2 w-2 rounded-sm"
                            style={{ background: `color-mix(in srgb, ${channel.color} ${AGE_ALPHA[i]}%, transparent)` }}
                          />
                          {b.label} <span className="num text-ink-2">{formatShare(b.share)}</span>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted">Noch keine Aufrufe in diesem Zeitraum gemessen.</p>
                )}
                {c.evergreens.length > 0 ? (
                  <div className="mt-2.5">
                    <p className="text-[11px] uppercase tracking-wider text-muted">Dauerläufer (älter als 30 Tage, 24h)</p>
                    <ul className="mt-1 space-y-0.5">
                      {c.evergreens.slice(0, 3).map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-3 text-xs">
                          <ShortLink id={e.id} className="flex min-w-0 items-center gap-2 text-ink-2 hover:text-ink" title={e.title}>
                            <ShortThumb
                              src={e.thumbnailUrl}
                              color={channel.color}
                              className="h-7 w-4"
                              preview={{ title: e.title, lines: [`+${formatCompact(e.views24h)} in 24h`, `${formatCompact(e.views)} gesamt`] }}
                            />
                            <span className="truncate hover:underline">{e.title}</span>
                          </ShortLink>
                          <span className="shrink-0 text-muted">
                            <span className="num font-semibold text-ink">+{formatCompact(e.views24h)}</span> · {formatAgo(e.publishedAt, now)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
