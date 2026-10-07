"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CHANNELS } from "@/config/channels";
import type { ProductionItem, ProductionStatus } from "@/lib/data/types";
import { dayLabel, dayOptions, SLOT_STYLE, STATUS_LABEL } from "./labels";
import { useTracker } from "./TrackerProvider";

/** Was bearbeitet wird: ein vorhandener Eintrag oder ein neuer (Kanal + Tag vorgegeben). */
export type EditorTarget = { item: ProductionItem } | { channelId: string; day: string | null; status?: ProductionStatus };

const STATUSES: ProductionStatus[] = ["idea", "produced", "scheduled", "published"];
const STATUS_DOT: Record<ProductionStatus, string> = {
  idea: SLOT_STYLE.idea.dot,
  produced: SLOT_STYLE.produced.dot,
  scheduled: SLOT_STYLE.scheduled.dot,
  published: SLOT_STYLE.online.dot,
};

const field =
  "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-line-strong focus:ring-2 focus:ring-white/10";

/** Fenster zum Bearbeiten eines Produktions-Eintrags (Titel, Status, Tag, Kanal, Notiz, Link). */
export function ItemEditor({ target, today, onClose }: { target: EditorTarget; today: string; onClose: () => void }) {
  const { create, update, remove } = useTracker();
  const existing = "item" in target ? target.item : null;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [status, setStatus] = useState<ProductionStatus>(existing?.status ?? ("item" in target ? "idea" : (target.status ?? "produced")));
  const [day, setDay] = useState<string | null>(existing ? existing.day : "item" in target ? null : target.day);
  const [channelId, setChannelId] = useState(existing?.channelId ?? ("item" in target ? CHANNELS[0].id : target.channelId));
  const [note, setNote] = useState(existing?.note ?? "");
  const [link, setLink] = useState(existing?.link ?? "");
  const [linkError, setLinkError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const options = dayOptions(today, 21, 2);
  if (day && !options.some((o) => o.day === day)) options.unshift({ day, label: dayLabel(day, today) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleanLink = link.trim();
    if (cleanLink && !/^https?:\/\/\S+$/i.test(cleanLink)) {
      setLinkError("Link muss mit http:// oder https:// beginnen.");
      return;
    }
    const values = { channelId, day, title: title.trim(), status, note: note.trim(), link: cleanLink || null };
    if (existing) {
      const patch = Object.fromEntries(
        Object.entries(values).filter(([k, v]) => existing[k as keyof typeof values] !== v),
      );
      if (Object.keys(patch).length) update(existing.id, patch);
    } else {
      create(values);
    }
    onClose();
  };

  const channel = CHANNELS.find((c) => c.id === channelId);

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label="Short bearbeiten">
      <motion.button
        type="button"
        aria-label="Schließen"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative m-0 max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line-strong bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 sm:m-4 sm:rounded-2xl"
      >
        <span className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" style={{ background: channel?.color }} aria-hidden />
        <h2 className="f1-heading text-sm text-ink">{existing ? "Short bearbeiten" : "Neuer Short"}</h2>

        <label className="mt-4 block text-xs text-muted">
          Titel / Thema
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="z. B. Oma reagiert auf Skibidi"
            className={`${field} mt-1`}
          />
        </label>

        <fieldset className="mt-4">
          <legend className="text-xs text-muted">Status</legend>
          <div className="mt-1 grid grid-cols-4 gap-1 rounded-xl border border-line bg-surface-2 p-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-semibold transition ${
                  status === s ? "bg-surface-3 text-ink" : "text-muted hover:text-ink-2"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[s]}`} aria-hidden />
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-xs text-muted">
            Tag
            <select
              value={day ?? ""}
              onChange={(e) => setDay(e.target.value || null)}
              className={`${field} mt-1`}
            >
              <option value="">Ohne Tag (Ideen)</option>
              {options.map((o) => (
                <option key={o.day} value={o.day}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-xs text-muted">
            <legend>Kanal</legend>
            <div className="mt-1 flex gap-1">
              {CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannelId(c.id)}
                  aria-pressed={channelId === c.id}
                  title={c.name}
                  className={`flex-1 rounded-lg border px-2 py-2 font-mono text-xs font-bold transition ${
                    channelId === c.id ? "border-line-strong bg-surface-3 text-ink" : "border-line text-muted hover:text-ink-2"
                  }`}
                  style={channelId === c.id ? { boxShadow: `inset 0 -2px 0 ${c.color}` } : undefined}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <label className="mt-4 block text-xs text-muted">
          Notiz
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Hook, Musik, Schnitt-Ideen …"
            className={`${field} mt-1 resize-y`}
          />
        </label>

        <label className="mt-4 block text-xs text-muted">
          Link (Vorbild, Datei, Entwurf)
          <input
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setLinkError(null);
            }}
            inputMode="url"
            placeholder="https://…"
            className={`${field} mt-1`}
          />
          {linkError ? <span className="mt-1 block text-live">{linkError}</span> : null}
        </label>

        <div className="mt-5 flex items-center gap-2">
          {existing ? (
            <button
              type="button"
              onClick={() => {
                remove(existing.id);
                onClose();
              }}
              className="rounded-lg border border-live/40 px-3 py-2 text-xs font-semibold text-live transition hover:bg-live/10 active:scale-95"
            >
              Löschen
            </button>
          ) : null}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-2 text-xs text-muted transition hover:text-ink-2 active:scale-95"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="rounded-lg bg-ink px-4 py-2 text-xs font-bold text-bg transition hover:bg-white active:scale-95"
          >
            Speichern
          </button>
        </div>
      </motion.form>
    </div>
  );
}
