"use client";

import { AnimatePresence, motion } from "motion/react";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { dayLabel, SLOT_STYLE } from "@/components/production/labels";
import { useTracker } from "@/components/production/TrackerProvider";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { ShortLink } from "@/components/ui/ShortLink";
import { ShortThumb } from "@/components/ui/ShortThumb";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { ChannelConfig } from "@/config/channels";
import type {
  SlotState,
  TrackerCell,
  TrackerDay,
  TrackerSlot,
} from "@/lib/data/types";
import { formatCompact, formatClock, formatIsoDayShort } from "@/lib/format";

const LEGEND: SlotState[] = [
  "open",
  "produced",
  "scheduled",
  "online",
  "missed",
];

/** Produktionsplan: Tage untereinander, je Kanal eine Spalte. Antippen schaltet weiter. */
export function ProductionPlanWidget() {
  const { data } = useDashboardData();
  const { available, view } = useTracker();
  if (!available) return null;

  const channels = data.channels.map((c) => ({
    channel: c.channel,
    avatarUrl: c.avatarUrl,
  }));

  return (
    <WidgetCard
      title="Produktionsplan"
      subtitle="Antippen: offen → produziert → eingeplant → offen. Hochgeladene Shorts haken sich von selbst ab."
      actions={
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          {LEGEND.map((s) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              <StatusDot state={s} />
              {SLOT_STYLE[s].label}
            </li>
          ))}
        </ul>
      }
    >
      {!view ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : (
        <div role="table" aria-label="Produktionsplan" className="space-y-1.5">
          <div
            role="row"
            className="grid grid-cols-2 gap-2 px-1.5 pb-1 sm:grid-cols-[6rem_1fr_1fr] sm:gap-3 sm:px-2"
          >
            <span
              role="columnheader"
              className="hidden text-[10px] uppercase tracking-wider text-muted sm:block"
            >
              Tag
            </span>
            {channels.map(({ channel, avatarUrl }) => (
              <span
                key={channel.id}
                role="columnheader"
                className="flex min-w-0 items-center gap-2"
              >
                <ChannelAvatar channel={channel} url={avatarUrl} size={18} />
                <span className="truncate text-xs font-semibold text-ink-2">
                  <span className="sm:hidden">{channel.code}</span>
                  <span className="hidden sm:inline">{channel.name}</span>
                </span>
              </span>
            ))}
          </div>
          {view.days.map((d) => (
            <DayRow
              key={d.day}
              day={d}
              today={view.today}
              channels={channels.map((c) => c.channel)}
            />
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

function DayRow({
  day,
  today,
  channels,
}: {
  day: TrackerDay;
  today: string;
  channels: ChannelConfig[];
}) {
  const { edit } = useTracker();
  const label = dayLabel(day.day, today);
  const relative =
    label === "Heute" || label === "Morgen" || label === "Gestern";
  const allDone = day.cells.every((c) => c.target === 0 || c.complete);
  const allReady = day.cells.every((c) => c.online + c.ready >= c.target);
  return (
    <div
      role="row"
      className={`relative grid grid-cols-2 items-start gap-x-2 gap-y-1 rounded-xl border p-1.5 transition-colors sm:grid-cols-[6rem_1fr_1fr] sm:gap-3 sm:p-2 ${
        day.isToday ? "border-line-strong bg-surface-2" : "border-transparent"
      } ${day.isPast ? "opacity-75" : ""}`}
    >
      {day.isToday ? (
        <span
          className="absolute inset-y-2 -left-px w-0.5 rounded-full bg-live"
          aria-hidden
        />
      ) : null}
      <div
        role="rowheader"
        className="col-span-2 flex items-baseline gap-2 pl-1 sm:col-span-1 sm:flex-col sm:gap-0 sm:pt-1"
      >
        <span
          className={`text-xs font-bold uppercase tracking-wider ${day.isToday ? "text-ink" : "text-ink-2"}`}
        >
          {label}
        </span>
        <span className="num text-[10px] text-muted">
          {relative ? formatIsoDayShort(day.day) : ""}
          {allDone ? (
            <span className="ml-1" title="Alles online">
              🏁
            </span>
          ) : !day.isPast && allReady ? (
            <span
              className="ml-1 text-sector-improved"
              title="Alles fertig produziert"
            >
              ✓
            </span>
          ) : null}
        </span>
        {!day.isPast ? (
          <button
            type="button"
            onClick={() =>
              edit({
                channelId: channels[0].id,
                day: day.day,
                status: "produced",
              })
            }
            className="ml-auto rounded-md px-2 text-[11px] text-muted transition hover:text-ink-2 sm:hidden"
            aria-label={`Weiteren Short am ${day.day} anlegen`}
          >
            + Short
          </button>
        ) : null}
      </div>
      {day.cells.map((cell) => {
        const channel = channels.find((c) => c.id === cell.channelId);
        return channel ? (
          <Cell key={cell.channelId} cell={cell} day={day} channel={channel} />
        ) : null;
      })}
    </div>
  );
}

function Cell({
  cell,
  day,
  channel,
}: {
  cell: TrackerCell;
  day: TrackerDay;
  channel: ChannelConfig;
}) {
  const { edit } = useTracker();
  return (
    <div role="cell" className="group/cell flex min-w-0 items-start gap-1">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <AnimatePresence initial={false}>
          {cell.slots.map((slot) => (
            <motion.div
              key={slot.key}
              layout="position"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
            >
              <Slot slot={slot} day={day} channel={channel} />
            </motion.div>
          ))}
        </AnimatePresence>
        {cell.target === 0 && cell.slots.length === 0 ? (
          <span className="px-2 py-2 text-[11px] text-muted/60">Pause</span>
        ) : null}
      </div>
      {!day.isPast ? (
        <button
          type="button"
          onClick={() =>
            edit({ channelId: channel.id, day: day.day, status: "produced" })
          }
          className="hidden h-11 w-6 shrink-0 place-items-center rounded-md text-sm text-muted opacity-0 transition hover:bg-white/5 hover:text-ink focus-visible:opacity-100 group-hover/cell:opacity-100 sm:grid"
          aria-label={`Weiteren Short für ${channel.code} am ${day.day} anlegen`}
          title="Weiteren Short anlegen"
        >
          +
        </button>
      ) : (
        <span className="hidden w-6 shrink-0 sm:block" aria-hidden />
      )}
    </div>
  );
}

function Slot({
  slot,
  day,
  channel,
}: {
  slot: TrackerSlot;
  day: TrackerDay;
  channel: ChannelConfig;
}) {
  const { cycle, edit } = useTracker();
  const style = SLOT_STYLE[slot.state];
  const base = `flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition active:scale-[0.98] ${style.box}`;

  // Echter Upload: Vorschaubild + Titel, Klick → Steckbrief
  if (slot.short) {
    const s = slot.short;
    return (
      <ShortLink
        id={s.id}
        className={`${base} hover:brightness-125`}
        title={s.title}
      >
        <ShortThumb
          src={s.thumbnailUrl}
          color={channel.color}
          className="h-8 w-[18px]"
          preview={{
            title: s.title,
            lines: [
              `${formatCompact(s.views)} Aufrufe`,
              `online seit ${formatClock(s.publishedAt)} Uhr`,
            ],
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{s.title}</span>
          <span className="num block text-[10px] text-muted">
            ✓ {formatClock(s.publishedAt)} · {formatCompact(s.views)} Aufrufe
          </span>
        </span>
      </ShortLink>
    );
  }

  const title = slot.item?.title || null;
  const clickable = slot.state !== "online";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() =>
          clickable
            ? cycle(channel.id, day.day, slot)
            : slot.item && edit({ item: slot.item })
        }
        className={`${base} ${slot.item ? "pr-8" : ""}`}
        aria-label={`${channel.code}, ${day.day}: ${style.label}${title ? ` – ${title}` : ""}. Antippen zum Weiterschalten.`}
      >
        <StatusDot state={slot.state} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate ${title ? "font-medium text-ink" : "font-semibold uppercase tracking-wider text-[10px]"}`}
          >
            {title ?? style.label}
          </span>
          {title ? (
            <span className="block text-[10px] text-muted">{style.label}</span>
          ) : null}
        </span>
        {slot.item?.link ? (
          <span className="text-[10px] text-muted" aria-hidden>
            🔗
          </span>
        ) : null}
      </button>
      {slot.item ? (
        <button
          type="button"
          onClick={() => edit({ item: slot.item! })}
          className="absolute inset-y-0 right-0 grid w-8 place-items-center rounded-r-lg text-muted transition hover:bg-white/5 hover:text-ink"
          aria-label="Bearbeiten"
          title="Bearbeiten"
        >
          ⋯
        </button>
      ) : null}
    </div>
  );
}

function StatusDot({ state }: { state: SlotState }) {
  return (
    <motion.span
      key={state}
      initial={{ scale: 0.4 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 600, damping: 22 }}
      className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[9px] font-black leading-none text-black ${SLOT_STYLE[state].dot}`}
      aria-hidden
    >
      {state === "online" ? (
        "✓"
      ) : state === "missed" ? (
        <span className="text-white">✕</span>
      ) : null}
    </motion.span>
  );
}
