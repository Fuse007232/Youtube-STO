"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { TimeRange } from "@/lib/data/types";
import { RANGES } from "@/lib/metrics/range";

/**
 * Globaler Zeitraum (Phase 8): ein Schalter im Kopf gilt für alle Widgets.
 * Wird im Browser gemerkt (nur eine Bequemlichkeit – ohne Speicher gilt „24h“).
 */

const STORAGE_KEY = "sto.range";
const RangeContext = createContext<{ range: TimeRange; setRange: (r: TimeRange) => void }>({
  range: "24h",
  setRange: () => {},
});

export function TimeRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<TimeRange>("24h");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && RANGES.some((r) => r.value === saved)) setRangeState(saved as TimeRange);
    } catch {
      // Speicher gesperrt (z. B. privates Fenster) → Standard bleibt
    }
  }, []);
  const setRange = useCallback((r: TimeRange) => {
    setRangeState(r);
    try {
      window.localStorage.setItem(STORAGE_KEY, r);
    } catch {
      // egal
    }
  }, []);
  return <RangeContext.Provider value={{ range, setRange }}>{children}</RangeContext.Provider>;
}

export function useTimeRange() {
  return useContext(RangeContext);
}

/** Der Schalter im Kopf. */
export function RangeSwitch() {
  const { range, setRange } = useTimeRange();
  return (
    <SegmentedControl
      label="Zeitraum für alle Widgets"
      value={range}
      onChange={setRange}
      options={RANGES.map((r) => ({ value: r.value, label: r.short, hint: r.label }))}
    />
  );
}

/** Kleiner Hinweis, wenn ein Widget einen anderen Zeitraum zeigt als gewählt. */
export function RangeNote({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-sector-worse/30 bg-sector-worse/10 px-1.5 py-0.5 text-[10px] font-medium text-ink-2">
      <span aria-hidden className="text-sector-worse">●</span>
      {children}
    </span>
  );
}
