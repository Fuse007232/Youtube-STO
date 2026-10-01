"use client";

import { useState } from "react";
import { useDashboardData, useNow } from "@/components/dashboard/DashboardDataProvider";
import { ChannelCode } from "@/components/ui/ChannelCode";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { ChannelConfig } from "@/config/channels";
import type { CommentItem } from "@/lib/data/types";
import { formatAgo, formatCompact, formatNumber } from "@/lib/format";

type Tab = "recent" | "top" | "hot";

/** Kommentar-Puls: Was schreiben die Fans gerade? */
export function CommentPulseWidget() {
  const { data } = useDashboardData();
  const [tab, setTab] = useState<Tab>("recent");
  const pulse = data.comments;
  if (!pulse) return null;
  const channelOf = new Map(data.channels.map((c) => [c.channel.id, c.channel]));

  return (
    <WidgetCard
      title="Kommentar-Puls"
      subtitle="Was schreiben deine Fans? (stündlich aktualisiert)"
      actions={
        <SegmentedControl
          label="Ansicht"
          value={tab}
          onChange={setTab}
          options={[
            { value: "recent", label: "Neueste" },
            { value: "top", label: "Beliebteste" },
            { value: "hot", label: "Heiße Shorts" },
          ]}
        />
      }
    >
      {tab === "hot" ? (
        pulse.hotShorts.length === 0 ? (
          <Empty text="In den letzten 24 Std. keine neuen Kommentare gemessen." />
        ) : (
          <ol className="divide-y divide-line">
            {pulse.hotShorts.map((s, i) => {
              const ch = channelOf.get(s.channelId);
              return (
                <li key={s.id}>
                  <a href={`/short/${s.id}`} className="flex items-center gap-3 py-2 hover:bg-surface-2/60">
                    <span className="num w-5 text-xs text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink" title={s.title}>
                        {s.title}
                      </span>
                      {ch ? <ChannelCode channel={ch} size="sm" /> : null}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-sm font-semibold text-ink">+{formatNumber(s.comments24h)}</span>
                      <span className="block text-[10px] text-muted">Kommentare 24h</span>
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        )
      ) : (
        <CommentList items={tab === "recent" ? pulse.recent : pulse.top} channelOf={channelOf} />
      )}
    </WidgetCard>
  );
}

function CommentList({ items, channelOf }: { items: CommentItem[]; channelOf: Map<string, ChannelConfig> }) {
  const now = useNow();
  if (items.length === 0) return <Empty text="Noch keine Kommentare gespeichert – der erste Abruf läuft mit dem nächsten Zeitplaner-Lauf." />;
  return (
    <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto pr-1">
      {items.map((c) => {
        const ch = channelOf.get(c.channelId);
        return (
          <li key={c.id} className="py-2.5">
            <div className="flex items-baseline justify-between gap-3 text-[11px] text-muted">
              <span className="truncate text-ink-2">{c.author}</span>
              <span className="shrink-0">{formatAgo(c.publishedAt, now)}</span>
            </div>
            <p className="mt-0.5 line-clamp-3 break-words text-sm text-ink">{c.text}</p>
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-muted">
              <a href={`/short/${c.videoId}`} className="flex min-w-0 items-center gap-1.5 hover:text-ink-2">
                {ch ? <span className="inline-block h-3 w-1 shrink-0 rounded-[2px]" style={{ background: ch.color }} aria-hidden /> : null}
                <span className="truncate">{c.videoTitle ?? "Short"}</span>
              </a>
              <span className="num shrink-0">
                ♥ {formatCompact(c.likes)}
                {c.replies > 0 ? ` · ${c.replies} Antw.` : ""}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted">{text}</p>;
}
