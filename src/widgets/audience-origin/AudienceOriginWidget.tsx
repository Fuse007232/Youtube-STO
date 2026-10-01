"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { BreakdownItem } from "@/lib/data/types";
import { formatCompact, formatShare } from "@/lib/format";

export function AudienceOriginWidget() {
  const { data } = useDashboardData();
  const channels = data.channels.map((c) => c.channel);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  if (!data.analytics) return null;

  const channel = channels.find((c) => c.id === channelId) ?? channels[0];
  const a = data.analytics.find((x) => x.channelId === channel?.id);

  return (
    <WidgetCard
      title="Zuschauer-Herkunft"
      subtitle="Letzte 28 Tage · YouTube Analytics"
      actions={
        <SegmentedControl
          label="Kanal"
          value={channel?.id ?? ""}
          onChange={setChannelId}
          options={channels.map((c) => ({ value: c.id, label: c.code }))}
        />
      }
    >
      {!a?.connected ? (
        <p className="py-8 text-center text-sm text-muted">
          {channel?.name} ist nicht verbunden.{" "}
          <a href="/settings" className="text-ink-2 underline">
            Verbinden
          </a>
        </p>
      ) : a.traffic.length === 0 && a.countries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Noch keine Daten – der erste Abruf läuft.</p>
      ) : (
        <div className="space-y-5">
          <BarList title="Traffic-Quellen" items={a.traffic} color={channel!.color} />
          <BarList title="Länder" items={a.countries} color={channel!.color} />
        </div>
      )}
    </WidgetCard>
  );
}

function BarList({ title, items, color }: { title: string; items: BreakdownItem[]; color: string }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.share));
  return (
    <div>
      <h3 className="f1-heading mb-2 text-[11px] text-muted">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.key} title={`${formatCompact(i.views)} Aufrufe`}>
            <div className="flex justify-between text-xs">
              <span className="truncate text-ink-2">{i.label}</span>
              <span className="num ml-2 shrink-0 text-ink">{formatShare(i.share)}</span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: i.key === "OTHER" ? "var(--sector-neutral)" : color }}
                initial={{ width: 0 }}
                animate={{ width: `${(i.share / max) * 100}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 22 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
