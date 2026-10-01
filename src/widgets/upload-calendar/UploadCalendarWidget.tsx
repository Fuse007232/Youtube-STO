"use client";

import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { ChannelCode } from "@/components/ui/ChannelCode";
import { WidgetCard } from "@/components/ui/WidgetCard";
import type { ChannelConfig } from "@/config/channels";
import type { UploadCalendar } from "@/lib/data/types";
import { formatCompact, formatIsoDayShort, formatNumber, formatOneDecimal } from "@/lib/format";
import { weekdayOf } from "@/lib/metrics/calendar";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WEEKDAY_LABELS = ["Mo", "", "Mi", "", "Fr", "", "So"];

/** Upload-Kalender: Raster wie bei GitHub – je Kanal 26 Wochen. */
export function UploadCalendarWidget() {
  const { data } = useDashboardData();
  if (!data.calendar || data.calendar.length === 0) return null;
  const hasViews = data.calendar.some((c) => c.viewsUntil !== null);

  return (
    <WidgetCard
      title="Upload-Kalender · 26 Wochen"
      subtitle={
        hasViews
          ? "Jedes Kästchen ein Tag: Farbe = Aufrufe des Tages (YouTube Analytics), Punkt = Upload."
          : "Jedes Kästchen ein Tag, Punkt = Upload. Aufrufe pro Tag erscheinen, sobald YouTube Analytics verbunden ist."
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">
        {data.calendar.map((cal) => {
          const channel = data.channels.find((c) => c.channel.id === cal.channelId)?.channel;
          return channel ? <ChannelCalendar key={cal.channelId} cal={cal} channel={channel} /> : null;
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          weniger
          {[0.15, 0.35, 0.6, 0.9].map((a) => (
            <span
              key={a}
              className="inline-block h-3 w-3 rounded-[3px]"
              style={{ background: `color-mix(in srgb, var(--text-2) ${Math.round(a * 100)}%, transparent)` }}
            />
          ))}
          mehr Aufrufe (in Kanalfarbe)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink" /> Upload
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-[3px] ring-1 ring-inset ring-ink/60" /> heute
        </span>
      </div>
    </WidgetCard>
  );
}

function ChannelCalendar({ cal, channel }: { cal: UploadCalendar; channel: Pick<ChannelConfig, "code" | "color" | "name"> }) {
  const views = cal.days.map((d) => d.views).filter((v): v is number => v !== null && v > 0);
  const lo = views.length ? Math.log(Math.min(...views)) : 0;
  const hi = views.length ? Math.log(Math.max(...views)) : 1;
  const strength = (v: number) => (hi > lo ? (Math.log(v) - lo) / (hi - lo) : 1);

  const weeks = Math.ceil(cal.days.length / 7);
  const uploads = cal.days.reduce((a, d) => a + d.uploads, 0);
  const best = cal.days.reduce<{ day: string; views: number } | null>(
    (b, d) => (d.views !== null && (!b || d.views > b.views) ? { day: d.day, views: d.views } : b),
    null,
  );
  const today = cal.days.at(-1)?.day;

  // Monatsbeschriftung über der ersten Woche, in der ein neuer Monat beginnt
  const monthLabels = Array.from({ length: weeks }, (_, w) => {
    const first = cal.days[w * 7];
    const prev = w > 0 ? cal.days[(w - 1) * 7] : null;
    const m = Number(first.day.slice(5, 7)) - 1;
    return !prev || Number(prev.day.slice(5, 7)) - 1 !== m ? MONTHS[m] : "";
  });

  return (
    <div className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ChannelCode channel={channel} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          <span>
            Serie <b className="num text-ink">{cal.currentStreak}</b> {cal.currentStreak === 1 ? "Tag" : "Tage"}
          </span>
          <span>
            Rekord <b className="num text-ink">{cal.longestStreak}</b>
          </span>
          <span>
            <b className="num text-ink">{uploads}</b> Uploads ({formatOneDecimal(uploads / weeks)}/Woche)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-1">
        <div />
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}>
          {monthLabels.map((m, i) => (
            <div key={i} className="overflow-visible whitespace-nowrap text-[10px] text-muted">
              {m}
            </div>
          ))}
        </div>
        <div className="grid grid-rows-7 gap-[3px]">
          {WEEKDAY_LABELS.map((l, i) => (
            <div key={i} className="flex items-center text-[9px] leading-none text-muted">
              {l}
            </div>
          ))}
        </div>
        <div
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {cal.days.map((d) => {
            const v = d.views;
            const bg =
              v !== null && v > 0
                ? `color-mix(in srgb, ${channel.color} ${Math.round(14 + 80 * strength(v))}%, transparent)`
                : "var(--surface-2)";
            const tip = [
              `${weekdayName(d.day)}, ${formatIsoDayShort(d.day)}`,
              v !== null ? `${formatNumber(v)} Aufrufe` : "keine Aufrufe-Daten",
              d.uploads ? `${d.uploads} ${d.uploads === 1 ? "Upload" : "Uploads"}` : "kein Upload",
            ].join(" · ");
            return (
              <div
                key={d.day}
                title={tip}
                className={`relative flex aspect-square items-center justify-center rounded-[3px] ${d.day === today ? "ring-1 ring-inset ring-ink/60" : ""}`}
                style={{ background: bg }}
              >
                {d.uploads > 0 ? (
                  <span
                    className={`rounded-full bg-ink ${d.uploads > 1 ? "h-[45%] w-[45%]" : "h-[30%] w-[30%]"}`}
                    aria-hidden
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        {best ? (
          <>
            Bester Tag: <span className="text-ink-2">{formatIsoDayShort(best.day)}</span> mit{" "}
            <span className="num text-ink-2">{formatCompact(best.views)}</span> Aufrufen
            {cal.viewsUntil ? ` · Aufrufe bis ${formatIsoDayShort(cal.viewsUntil)} (YouTube meldet mit 2–3 Tagen Verzug)` : ""}
          </>
        ) : (
          "Noch keine Aufrufe pro Tag – Kanal in den Einstellungen mit YouTube Analytics verbinden."
        )}
      </p>
    </div>
  );
}

const WEEKDAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
function weekdayName(day: string): string {
  return WEEKDAY_NAMES[weekdayOf(day)];
}
