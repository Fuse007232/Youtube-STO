"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CHANNELS } from "@/config/channels";
import { useDashboardData, useNow } from "@/components/dashboard/DashboardDataProvider";
import type { ProductionItem, ProductionStatus, TrackerData, TrackerSlot, TrackerView } from "@/lib/data/types";
import { berlinDay } from "@/lib/metrics/calendar";
import { buildTracker, nextStatus } from "@/lib/metrics/production";
import { ItemEditor, type EditorTarget } from "./ItemEditor";

/**
 * Daten des Produktionsplans (Phase 9) für die Widgets im Bereich „Produktion“.
 * Jede Änderung erscheint sofort (optimistisch) und wird dann der Reihe nach
 * gespeichert – danach lädt der Plan neu. Schlägt etwas fehl, gilt wieder der
 * Stand der Datenbank (mit Fehlermeldung).
 */

export interface NewItem {
  channelId: string;
  day: string | null;
  title?: string;
  status?: ProductionStatus;
  note?: string;
  link?: string | null;
}
export type ItemPatch = Partial<Omit<ProductionItem, "id" | "createdAt">>;

interface TrackerContextValue {
  /** false = Datenquelle ohne Produktionsplan (YouTube direkt). */
  available: boolean;
  view: TrackerView | null;
  error: string | null;
  saving: boolean;
  /** Platz antippen: offen → produziert → eingeplant → offen. */
  cycle: (channelId: string, day: string, slot: TrackerSlot) => void;
  create: (input: NewItem) => void;
  update: (id: number, patch: ItemPatch) => void;
  remove: (id: number) => void;
  setTarget: (channelId: string, perDay: number) => void;
  /** Bearbeiten-Fenster öffnen (vorhandener Eintrag oder neuer an einem Tag). */
  edit: (target: EditorTarget) => void;
  /** Fester React-Schlüssel eines Eintrags (bleibt gleich, wenn die vorläufige ID zur echten wird). */
  itemKey: (id: number) => string;
}

const TrackerContext = createContext<TrackerContextValue | null>(null);

export function useTracker(): TrackerContextValue {
  const ctx = useContext(TrackerContext);
  if (!ctx) throw new Error("useTracker() muss innerhalb von <TrackerProvider> stehen");
  return ctx;
}

async function api<T = unknown>(url: string, method: string, body?: unknown): Promise<T | null> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Speichern fehlgeschlagen (${res.status}).`);
  }
  return res.status === 204 ? null : ((await res.json()) as T);
}

/** Vorläufige ID → echte ID (undefined = noch nicht / nie gespeichert). */
function realId(map: Map<number, number>, id: number): number | undefined {
  return id < 0 ? map.get(id) : id;
}
function sameItem(map: Map<number, number>, item: ProductionItem, id: number): boolean {
  return item.id === id || (id < 0 && item.id === map.get(id));
}

const buzz = () => {
  try {
    navigator.vibrate?.(8);
  } catch {
    // egal
  }
};

export function TrackerProvider({
  initial,
  available,
  children,
}: {
  initial: TrackerData | null;
  available: boolean;
  children: ReactNode;
}) {
  const { refresh: refreshDashboard } = useDashboardData();
  const [raw, setRaw] = useState<TrackerData | null>(initial);
  const [error, setError] = useState<string | null>(available && !initial ? "Produktionsplan konnte nicht geladen werden." : null);
  const [saving, setSaving] = useState(0);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  /** Vorläufige IDs (negativ) → echte IDs aus der Datenbank. */
  const ids = useRef(new Map<number, number>());
  const nextTemp = useRef(-1);

  const now = useNow();
  const today = berlinDay(now);
  const view = useMemo(
    () =>
      raw
        ? buildTracker({
            channelIds: CHANNELS.map((c) => c.id),
            items: raw.items,
            published: raw.published,
            targets: raw.targets,
            now: Date.parse(`${today}T12:00:00Z`),
          })
        : null,
    [raw, today],
  );

  const reload = useCallback(async () => {
    if (!available) return;
    try {
      const res = await fetch("/api/tracker", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as TrackerData;
      // Während noch gespeichert wird, nicht mit älterem Stand überschreiben
      if (pending.current === 0) setRaw(data);
    } catch {
      // nächster Versuch beim nächsten Neuladen
    }
  }, [available]);

  // Erstes Laden (falls der Server nichts mitgeben konnte) + jede Minute frisch
  useEffect(() => {
    if (!available) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initial) void reload().then(() => setError(null));
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [available, initial, reload]);

  const run = useCallback(
    (optimistic: (r: TrackerData) => TrackerData, request: () => Promise<void>) => {
      setRaw((r) => (r ? optimistic(r) : r));
      pending.current++;
      setSaving((s) => s + 1);
      queue.current = queue.current.then(async () => {
        try {
          await request();
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          pending.current--;
          setSaving((s) => s - 1);
        }
        if (pending.current === 0) {
          await reload();
          void refreshDashboard(); // Zähler am Reiter
        }
      });
    },
    [reload, refreshDashboard],
  );

  const create = useCallback(
    (input: NewItem) => {
      const temp = nextTemp.current--;
      const item: ProductionItem = {
        id: temp,
        channelId: input.channelId,
        day: input.day,
        title: input.title ?? "",
        status: input.status ?? "idea",
        note: input.note ?? "",
        link: input.link ?? null,
        createdAt: Date.now(),
      };
      run(
        (r) => ({ ...r, items: [...r.items, item] }),
        async () => {
          const saved = await api<ProductionItem>("/api/tracker", "POST", input);
          if (saved) ids.current.set(temp, saved.id);
        },
      );
    },
    [run],
  );

  const update = useCallback(
    (id: number, patch: ItemPatch) => {
      run(
        (r) => ({ ...r, items: r.items.map((i) => (sameItem(ids.current, i, id) ? { ...i, ...patch } : i)) }),
        async () => {
          const real = realId(ids.current, id);
          if (real === undefined) throw new Error("Eintrag wurde nicht gespeichert.");
          await api(`/api/tracker/${real}`, "PATCH", patch);
        },
      );
    },
    [run],
  );

  const remove = useCallback(
    (id: number) => {
      run(
        (r) => ({ ...r, items: r.items.filter((i) => !sameItem(ids.current, i, id)) }),
        async () => {
          const real = realId(ids.current, id);
          if (real === undefined) return;
          await api(`/api/tracker/${real}`, "DELETE");
        },
      );
    },
    [run],
  );

  const setTarget = useCallback(
    (channelId: string, perDay: number) => {
      const n = Math.max(0, Math.min(10, perDay));
      run(
        (r) => ({ ...r, targets: { ...r.targets, [channelId]: n } }),
        async () => {
          await api("/api/tracker/targets", "PUT", { channelId, perDay: n });
        },
      );
    },
    [run],
  );

  const cycle = useCallback(
    (channelId: string, day: string, slot: TrackerSlot) => {
      if (slot.state === "online") return;
      buzz();
      const next = nextStatus(slot.state);
      if (!slot.item) {
        create({ channelId, day, status: next ?? "produced" });
      } else if (next === null) {
        // Zurück auf „offen“: leere Einträge verschwinden, benannte bleiben als Idee
        const it = slot.item;
        if (!it.title && !it.note && !it.link) remove(it.id);
        else update(it.id, { status: "idea" });
      } else {
        update(slot.item.id, { status: next });
      }
    },
    [create, update, remove],
  );

  const itemKey = useCallback((id: number) => {
    for (const [temp, real] of ids.current) if (real === id) return `i${temp}`;
    return `i${id}`;
  }, []);

  const value = useMemo<TrackerContextValue>(
    () => ({ available, view, error, saving: saving > 0, cycle, create, update, remove, setTarget, edit: setEditor, itemKey }),
    [available, view, error, saving, cycle, create, update, remove, setTarget, itemKey],
  );

  return (
    <TrackerContext.Provider value={value}>
      {children}
      {editor && view ? <ItemEditor target={editor} today={view.today} onClose={() => setEditor(null)} /> : null}
    </TrackerContext.Provider>
  );
}
