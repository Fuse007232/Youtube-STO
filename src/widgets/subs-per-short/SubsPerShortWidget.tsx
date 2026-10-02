"use client";

import Image from "next/image";
import { useState } from "react";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { ChannelCode } from "@/components/ui/ChannelCode";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { AnalyticsShort } from "@/lib/data/types";
import { formatCompact, formatNumber, formatOneDecimal, formatPercentValue } from "@/lib/format";
import { ShortLink } from "@/components/ui/ShortLink";

type Sort = "subs" | "rate";
const LIMIT = 10;

export function SubsPerShortWidget() {
  const { data } = useDashboardData();
  const [channelFilter, setChannelFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("subs");
  if (!data.analytics) return null;

  const channels = data.channels.map((c) => c.channel);
  const channelOf = new Map(channels.map((c) => [c.id, c]));
  const connected = data.analytics.filter((a) => a.connected);

  const rows: (AnalyticsShort & { channelId: string })[] = connected
    .filter((a) => channelFilter === "all" || a.channelId === channelFilter)
    .flatMap((a) => a.shorts.map((s) => ({ ...s, channelId: a.channelId })))
    // Für „Abos pro 1.000“ nur Shorts mit genug Aufrufen (sonst verzerren Zufallstreffer)
    .filter((s) => sort === "subs" || s.views >= 5_000)
    .sort((a, b) => (sort === "subs" ? b.subsGained - a.subsGained : b.subsPer1k - a.subsPer1k))
    .slice(0, LIMIT);

  return (
    <WidgetCard
      title="Abo-Magneten · 28 Tage"
      subtitle="Welche Shorts bringen die meisten neuen Abos? (YouTube Analytics)"
      actions={
        <>
          <SegmentedControl
            label="Kanal"
            value={channelFilter}
            onChange={setChannelFilter}
            options={[{ value: "all", label: "Alle" }, ...channels.map((c) => ({ value: c.id, label: c.code }))]}
          />
          <SegmentedControl
            label="Sortierung"
            value={sort}
            onChange={setSort}
            options={[
              { value: "subs", label: "Neue Abos" },
              { value: "rate", label: "Pro 1.000 Aufrufe" },
            ]}
          />
        </>
      }
    >
      {connected.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Noch kein Kanal verbunden.{" "}
          <a href="/settings" className="text-ink-2 underline">
            Jetzt verbinden
          </a>
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Noch keine Daten – der erste Abruf läuft.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="w-8 pb-2 font-medium">#</th>
                <th className="pb-2 font-medium">Short</th>
                <th className="pb-2 text-right font-medium">Neue Abos</th>
                <th className="pb-2 text-right font-medium">Aufrufe</th>
                <th className="pb-2 text-right font-medium" title="Neue Abos pro 1.000 Aufrufe">
                  Abos/1.000
                </th>
                <th className="pb-2 text-right font-medium" title="Durchschnittlich angesehener Anteil">
                  Ø gesehen
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const ch = channelOf.get(s.channelId);
                return (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-2 font-mono text-xs text-muted">{i + 1}</td>
                    <td className="py-2">
                      <ShortLink
                        id={s.id}
                        className="flex items-center gap-3 hover:text-ink"
                      >
                        {s.thumbnailUrl ? (
                          <Image
                            src={s.thumbnailUrl}
                            alt=""
                            width={22}
                            height={39}
                            unoptimized
                            className="h-[39px] w-[22px] shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span
                            className="h-[39px] w-[22px] shrink-0 rounded"
                            style={{ background: `linear-gradient(160deg, ${ch?.color ?? "#555"}, #000 140%)` }}
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0">
                          <span className="block max-w-[28ch] truncate text-ink sm:max-w-[40ch]" title={s.title}>
                            {s.title}
                          </span>
                          {ch ? <ChannelCode channel={ch} size="sm" /> : null}
                        </span>
                      </ShortLink>
                    </td>
                    <td className="num py-2 text-right font-semibold text-ink">+{formatNumber(s.subsGained)}</td>
                    <td className="num py-2 text-right text-ink-2">{formatCompact(s.views)}</td>
                    <td className="num py-2 text-right text-ink-2">{formatOneDecimal(s.subsPer1k)}</td>
                    <td className="num py-2 text-right text-ink-2">{formatPercentValue(s.avgViewPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </WidgetCard>
  );
}
