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
import { APP_CONFIG } from "@/config/app";
import type { ChannelSummary, DashboardData } from "@/lib/data/types";
import { extrapolate } from "@/lib/metrics/extrapolate";

/**
 * Der gemeinsame „Daten-Topf“ für alle Widgets.
 * - Holt jede Minute frische Daten von /api/dashboard (pausiert, wenn der Tab im Hintergrund ist).
 * - Stellt eine sekündlich tickende Uhr bereit (für Hochrechnung und Countdown).
 */

interface DashboardContextValue {
  data: DashboardData;
  /** Zeitpunkt des letzten erfolgreichen Abrufs (ms). */
  fetchedAt: number;
  error: string | null;
  refresh: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);
// Eigener Kontext für die Uhr, damit nur Widgets neu zeichnen, die sie wirklich brauchen.
const NowContext = createContext<number>(0);

export function DashboardDataProvider({
  initialData,
  children,
}: {
  initialData: DashboardData;
  children: ReactNode;
}) {
  const [data, setData] = useState(initialData);
  const [fetchedAt, setFetchedAt] = useState(initialData.generatedAt);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(initialData.generatedAt);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) throw new Error(`Server antwortet mit ${res.status}`);
      const next = (await res.json()) as DashboardData;
      setData(next);
      setFetchedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Uhr: jede Sekunde weiterzählen.
  useEffect(() => {
    // Nach dem Laden einmal mit der echten Browser-Uhr abgleichen
    // (erst im Effekt, damit Server- und Browser-HTML beim ersten Zeichnen gleich sind).
    const sync = () => setNow(Date.now());
    const first = setTimeout(sync, 0);
    const id = setInterval(sync, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);

  // Regelmäßig neue Daten holen; beim Zurückkehren in den Tab sofort.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, APP_CONFIG.pollIntervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ data, fetchedAt, error, refresh }),
    [data, fetchedAt, error, refresh],
  );

  return (
    <DashboardContext.Provider value={value}>
      <NowContext.Provider value={now}>{children}</NowContext.Provider>
    </DashboardContext.Provider>
  );
}

/** Zugriff auf die Dashboard-Daten – in jedem Widget verwendbar. */
export function useDashboardData(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboardData() muss innerhalb von <DashboardDataProvider> stehen");
  return ctx;
}

/** Aktuelle Uhrzeit (ms), aktualisiert sich jede Sekunde. */
export function useNow(): number {
  return useContext(NowContext);
}

/**
 * Hochgerechnete „Live“-Werte eines Kanals: Gesamtaufrufe und 24h-Aufrufe
 * laufen zwischen zwei Schnappschüssen im gemessenen Tempo weiter.
 * Abos werden nicht hochgerechnet (öffentlich nur gerundet).
 */
export interface LiveValues {
  views: number;
  views24h: number;
  viewsPerHour: number;
  isEstimated: boolean;
}

function liveValues(channel: ChannelSummary, data: DashboardData, now: number): LiveValues {
  const maxMs = data.snapshotIntervalMin * 60_000 * APP_CONFIG.maxExtrapolationFactor;
  const rate = channel.rate.viewsPerSecond;
  const views = extrapolate(channel.current.views, rate, data.lastSnapshotAt, now, maxMs);
  const extra = views - channel.current.views;
  return {
    views,
    views24h: channel.delta24h.views + extra,
    viewsPerHour: rate * 3600,
    isEstimated: extra > 0,
  };
}

/** Live-Werte für einen Kanal. */
export function useLiveChannel(channel: ChannelSummary): LiveValues {
  const { data } = useDashboardData();
  return liveValues(channel, data, useNow());
}

/** Live-Werte für alle Kanäle (gleiche Reihenfolge wie data.channels). */
export function useLiveChannels(): { summary: ChannelSummary; live: LiveValues }[] {
  const { data } = useDashboardData();
  const now = useNow();
  return data.channels.map((summary) => ({ summary, live: liveValues(summary, data, now) }));
}
