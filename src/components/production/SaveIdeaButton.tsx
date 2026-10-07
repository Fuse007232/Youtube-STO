"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CHANNELS } from "@/config/channels";

type State = { kind: "idle" } | { kind: "pick" } | { kind: "saving" } | { kind: "saved"; code: string } | { kind: "error"; message: string };

/**
 * „💡 Merken“: legt einen fremden Short als Idee im Ideen-Parkplatz ab
 * (Titel + Link zum Vorbild). Kanal wird kurz abgefragt.
 */
export function SaveIdeaButton({ videoId, title }: { videoId: string; title: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const save = async (channelId: string, code: string) => {
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/tracker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channelId,
          day: null,
          status: "idea",
          title: title.slice(0, 200),
          link: `https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "Speichern fehlgeschlagen.");
      }
      setState({ kind: "saved", code });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const base = "flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border text-[11px] font-semibold transition active:scale-95";
  return (
    <div className="mt-1.5">
      <AnimatePresence mode="wait" initial={false}>
        {state.kind === "pick" ? (
          <motion.div
            key="pick"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex gap-1"
            role="group"
            aria-label="Für welchen Kanal merken?"
          >
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => save(c.id, c.code)}
                title={`Als Idee für ${c.name} merken`}
                className={`${base} border-line-strong bg-surface-3 font-mono text-ink hover:brightness-125`}
                style={{ boxShadow: `inset 0 -2px 0 ${c.color}` }}
              >
                {c.code}
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.button
            key={state.kind}
            type="button"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            disabled={state.kind === "saving" || state.kind === "saved"}
            onClick={() => setState({ kind: "pick" })}
            title={state.kind === "error" ? state.message : "Als Idee im Produktions-Bereich merken"}
            className={`${base} ${
              state.kind === "saved"
                ? "border-sector-improved/40 bg-sector-improved/10 text-ink"
                : state.kind === "error"
                  ? "border-live/40 bg-live/10 text-ink-2"
                  : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-ink-2"
            }`}
          >
            {state.kind === "saved"
              ? `✓ Gemerkt für ${state.code}`
              : state.kind === "saving"
                ? "Speichert …"
                : state.kind === "error"
                  ? "Nochmal versuchen"
                  : "💡 Als Idee merken"}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
