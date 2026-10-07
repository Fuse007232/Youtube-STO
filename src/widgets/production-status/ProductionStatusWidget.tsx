"use client";

import { motion } from "motion/react";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { bufferTone } from "@/components/production/labels";
import { useTracker } from "@/components/production/TrackerProvider";
import { ChannelAvatar } from "@/components/ui/ChannelAvatar";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { formatHourRange, WEEKDAYS_LONG } from "@/lib/format";
import { TIMING } from "@/lib/metrics/upload-timing";

const TONE = {
  red: { chip: "bg-live/15 text-live border-live/40", text: "Heute offen" },
  yellow: { chip: "bg-sector-worse/15 text-sector-worse border-sector-worse/40", text: "Knapp" },
  green: { chip: "bg-sector-improved/15 text-sector-improved border-sector-improved/40", text: "Gepolstert" },
} as const;

/** „Vorlauf“: Wie viele Tage sind schon fertig? Tagesziel, Woche, beste Upload-Zeit. */
export function ProductionStatusWidget() {
  const { data } = useDashboardData();
  const { available, view, error, saving, setTarget } = useTracker();

  if (!available) {
    return (
      <WidgetCard title="Produktion">
        <p className="py-8 text-center text-sm text-muted">Der Produktionsplan braucht die Datenbank (läuft online automatisch).</p>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard
      title="Vorlauf · Boxengasse"
      subtitle="Wie viele Tage sind schon abgedeckt (online oder fertig produziert)?"
      actions={
        error ? (
          <span className="rounded-md border border-live/40 bg-live/10 px-2 py-1 text-[11px] text-live" role="alert">
            {error}
          </span>
        ) : saving ? (
          <span className="text-[11px] text-muted">Speichert …</span>
        ) : null
      }
    >
      {!view ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="skeleton h-36 rounded-xl" />
          <div className="skeleton h-36 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {view.summary.map((s, i) => {
            const summary = data.channels.find((c) => c.channel.id === s.channelId);
            if (!summary) return null;
            const { channel } = summary;
            const tone = s.target === 0 ? null : TONE[bufferTone(s.bufferDays)];
            const timing = data.uploadTiming?.find((t) => t.scope === s.channelId)?.recommendation ?? null;
            const weekPct = s.weekTarget > 0 ? Math.min(1, s.weekOnline / s.weekTarget) : 0;
            const capped = s.bufferDays > 30;
            return (
              <motion.div
                key={s.channelId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className="relative overflow-hidden rounded-xl border border-line bg-surface-2 p-4"
              >
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: channel.color }} aria-hidden />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ChannelAvatar channel={channel} url={summary.avatarUrl} size={30} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{channel.name}</p>
                      <p className="text-[11px] text-muted">
                        Heute: <b className="num text-ink-2">{s.todayOnline}</b> online
                        {s.todayReady ? (
                          <>
                            {" "}
                            · <b className="num text-ink-2">{s.todayReady}</b> fertig
                          </>
                        ) : null}
                        {s.todayOpen ? (
                          <>
                            {" "}
                            · <b className="num text-live">{s.todayOpen}</b> offen
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="num text-3xl font-black leading-none text-ink">
                      {capped ? "30+" : s.bufferDays}
                      <span className="ml-1 text-xs font-semibold text-muted">{s.bufferDays === 1 ? "Tag" : "Tage"}</span>
                    </p>
                    {tone ? (
                      <span className={`mt-1.5 inline-block whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${tone.chip}`}>
                        {tone.text}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-baseline justify-between text-[11px] text-muted">
                    <span>Diese Woche online</span>
                    <span className="num">
                      <b className="text-ink-2">{s.weekOnline}</b> / {s.weekTarget}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: channel.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${weekPct * 100}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                  <span>
                    Auf Halde: <b className="num text-ink-2">{s.readyCount}</b> fertig
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    Tagesziel
                    <span className="inline-flex items-center rounded-lg border border-line bg-surface">
                      <button
                        type="button"
                        onClick={() => setTarget(s.channelId, s.target - 1)}
                        disabled={s.target <= 0}
                        className="px-2 py-0.5 text-ink-2 transition hover:text-ink disabled:opacity-30"
                        aria-label={`Tagesziel ${channel.code} senken`}
                      >
                        −
                      </button>
                      <span className="num w-4 text-center font-bold text-ink">{s.target}</span>
                      <button
                        type="button"
                        onClick={() => setTarget(s.channelId, s.target + 1)}
                        disabled={s.target >= 10}
                        className="px-2 py-0.5 text-ink-2 transition hover:text-ink disabled:opacity-30"
                        aria-label={`Tagesziel ${channel.code} erhöhen`}
                      >
                        +
                      </button>
                    </span>
                    pro Tag
                  </span>
                </div>

                {timing ? (
                  <p className="mt-3 border-t border-line pt-2.5 text-[11px] text-muted">
                    ⏱ Upload-Tipp:{" "}
                    <b className="text-ink-2">{formatHourRange(timing.block * TIMING.blockHours, TIMING.blockHours)}</b>
                    {timing.block !== timing.defaultBlock && timing.confidence !== "unsicher" ? ` (+${Math.round(timing.upliftPct)} %)` : ""}
                    {timing.weekday !== null ? <> · stärkster Tag {WEEKDAYS_LONG[timing.weekday]}</> : null}
                  </p>
                ) : null}
              </motion.div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}
