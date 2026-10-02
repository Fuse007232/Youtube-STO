import type { ComponentType } from "react";

/**
 * Breite eines Widgets im Dashboard-Raster (auf großen Bildschirmen):
 * - small  = 1/3
 * - medium = 1/2
 * - large  = 2/3
 * - full   = ganze Breite
 * Auf dem Handy ist jedes Widget immer volle Breite.
 */
export type WidgetSize = "small" | "medium" | "large" | "full";

export interface WidgetDefinition {
  /** Eindeutige ID, z. B. "top-shorts". */
  id: string;
  /** Name des Widgets (für Übersichten und Bildschirmleser). */
  title: string;
  /** Kurzbeschreibung: Was zeigt das Widget? */
  description: string;
  size: WidgetSize;
  /** Die React-Komponente. Bekommt keine Props – Daten kommen aus useDashboardData(). */
  component: ComponentType;
}

/** Hilfsfunktion, damit TypeScript die Widget-Beschreibung prüft. */
export function defineWidget(def: WidgetDefinition): WidgetDefinition {
  return def;
}

/** Bereiche des Dashboards (Reiter oben bzw. Leiste unten am Handy). */
export type DashboardPageId = "race" | "strategy" | "analysis" | "rivals";
