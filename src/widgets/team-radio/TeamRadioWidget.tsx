"use client";

import { AnimatePresence, motion } from "motion/react";
import { useDashboardData, useNow } from "@/components/dashboard/DashboardDataProvider";
import { ChannelCode } from "@/components/ui/ChannelCode";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { AlertItem } from "@/lib/data/types";
import { formatAgo, formatNumber, formatOneDecimal } from "@/lib/format";

const KIND = {
  rocket: { icon: "🚀", label: "Raketenstart" },
  breakout: { icon: "📈", label: "Ausbruch" },
} as const;

export function TeamRadioWidget() {
  const { data } = useDashboardData();
  const now = useNow();
  if (!data.alerts) return null;
  const channelOf = new Map(data.channels.map((c) => [c.channel.id, c.channel]));

  return (
    <WidgetCard title="Boxenfunk" subtitle="„Short geht ab“-Alarme · letzte 7 Tage">
      {data.alerts.length === 0 ? (
        <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
          <span className="text-2xl" aria-hidden>
            📻
          </span>
          <p className="text-sm text-ink-2">Funkstille.</p>
          <p className="max-w-[28ch] text-xs text-muted">
            Sobald ein Short plötzlich abgeht, meldet sich hier der Boxenfunk – und per E-Mail.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {data.alerts.slice(0, 8).map((a) => (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-xl border border-line bg-bg/40 p-3"
              >
                <RadioItem alert={a} channel={channelOf.get(a.channelId)} now={now} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </WidgetCard>
  );
}

function RadioItem({
  alert: a,
  channel,
  now,
}: {
  alert: AlertItem;
  channel: { name: string; code: string; color: string } | undefined;
  now: number;
}) {
  const factor = a.baselineHour && a.baselineHour > 0 ? a.viewsLastHour / a.baselineHour : null;
  return (
    <a href={`https://www.youtube.com/shorts/${a.videoId}`} target="_blank" rel="noreferrer" className="block">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden>{KIND[a.kind].icon}</span>
          <span className="f1-heading text-ink-2">{KIND[a.kind].label}</span>
          {channel ? <ChannelCode channel={channel} size="sm" /> : null}
        </span>
        <span>{formatAgo(a.detectedAt, now)}</span>
      </div>
      <p className="mt-1 truncate text-sm text-ink" title={a.title}>
        {a.title || "(Short)"}
      </p>
      <p className="num mt-0.5 text-xs text-ink-2">
        <b className="text-ink">{formatNumber(a.viewsLastHour)}</b> Aufrufe/Std.
        {factor ? (
          <span className="text-muted">
            {" "}
            · {formatOneDecimal(factor)}× {a.kind === "rocket" ? "vom Kanal-Schnitt" : "üblich"}
          </span>
        ) : null}
        {a.emailError ? (
          <span className="text-sector-worse" title={a.emailError}>
            {" "}
            · ✉ fehlgeschlagen
          </span>
        ) : a.emailedAt ? (
          <span className="text-muted"> · ✉ gesendet</span>
        ) : null}
      </p>
    </a>
  );
}
