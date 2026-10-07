"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useDashboardData } from "@/components/dashboard/DashboardDataProvider";
import { dayOptions } from "@/components/production/labels";
import { useTracker } from "@/components/production/TrackerProvider";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { CHANNELS } from "@/config/channels";

/** Ideen-Parkplatz: Einfälle ohne Tag sammeln und später einplanen. */
export function IdeaParkingWidget() {
  const { data } = useDashboardData();
  const { available, view, create, update, remove, edit, itemKey } = useTracker();
  const [title, setTitle] = useState("");
  const [channelId, setChannelId] = useState(CHANNELS[0].id);
  if (!available) return null;

  const add = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    create({ channelId, day: null, title: t, status: "idea" });
    setTitle("");
  };
  const channelOf = (id: string) => data.channels.find((c) => c.channel.id === id)?.channel ?? CHANNELS.find((c) => c.id === id);
  const options = view ? dayOptions(view.today, 13) : [];

  return (
    <WidgetCard title="Ideen-Parkplatz" subtitle="Einfälle sammeln – wenn's soweit ist, einem Tag zuweisen.">
      <form onSubmit={add} className="flex gap-1.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Neue Idee …"
          aria-label="Neue Idee"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-line-strong"
        />
        <div className="flex rounded-lg border border-line bg-surface-2 p-0.5" role="radiogroup" aria-label="Kanal">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={channelId === c.id}
              onClick={() => setChannelId(c.id)}
              title={c.name}
              className={`rounded-md px-2 font-mono text-[11px] font-bold transition ${channelId === c.id ? "bg-surface-3 text-ink" : "text-muted hover:text-ink-2"}`}
              style={channelId === c.id ? { boxShadow: `inset 0 -2px 0 ${c.color}` } : undefined}
            >
              {c.code}
            </button>
          ))}
        </div>
        <button
          type="submit"
          disabled={!title.trim()}
          className="rounded-lg bg-ink px-3 text-sm font-bold text-bg transition hover:bg-white active:scale-95 disabled:opacity-30"
          aria-label="Idee speichern"
        >
          +
        </button>
      </form>

      {!view ? (
        <div className="mt-3 space-y-2">
          <div className="skeleton h-10 rounded-lg" />
          <div className="skeleton h-10 rounded-lg" />
        </div>
      ) : view.backlog.length === 0 ? (
        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          Noch keine Ideen geparkt.
          <br />
          Tipp: Im{" "}
          <Link href="/konkurrenz" transitionTypes={["nav-forward"]} className="text-ink-2 underline">
            Konkurrenz-Radar
          </Link>{" "}
          „💡 Merken“ antippen.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          <AnimatePresence initial={false}>
            {view.backlog.map((item) => {
              const ch = channelOf(item.channelId);
              return (
                <motion.li
                  key={itemKey(item.id)}
                  layout="position"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.18 }}
                  className="relative flex items-center gap-2 overflow-hidden rounded-lg border border-line bg-surface-2 py-1.5 pl-3 pr-1.5"
                >
                  <span className="absolute inset-y-0 left-0 w-1" style={{ background: ch?.color }} aria-hidden />
                  <button
                    type="button"
                    onClick={() => edit({ item })}
                    className="min-w-0 flex-1 text-left"
                    title="Bearbeiten"
                  >
                    <span className="block truncate text-xs font-medium text-ink hover:underline">{item.title || "Ohne Titel"}</span>
                    <span className="block text-[10px] text-muted">
                      {ch?.code}
                      {item.note ? ` · ${item.note.slice(0, 40)}${item.note.length > 40 ? "…" : ""}` : ""}
                    </span>
                  </button>
                  {item.link ? (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="grid h-7 w-7 place-items-center rounded-md text-xs text-muted transition hover:bg-white/5 hover:text-ink"
                      title="Vorbild öffnen"
                      aria-label="Vorbild öffnen"
                    >
                      🔗
                    </a>
                  ) : null}
                  <select
                    value=""
                    onChange={(e) => e.target.value && update(item.id, { day: e.target.value })}
                    className="w-[5.5rem] rounded-md border border-line bg-surface px-1 py-1 text-[11px] text-ink-2 outline-none transition hover:border-line-strong"
                    aria-label={`„${item.title}“ einplanen`}
                    title="Einplanen"
                  >
                    <option value="">Einplanen</option>
                    {options.map((o) => (
                      <option key={o.day} value={o.day}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted transition hover:bg-live/10 hover:text-live"
                    aria-label={`„${item.title}“ löschen`}
                    title="Löschen"
                  >
                    ×
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </WidgetCard>
  );
}
