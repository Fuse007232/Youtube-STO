import type { DashboardPageId, WidgetDefinition } from "./types";
import analyticsOverview from "./analytics-overview";
import audienceOrigin from "./audience-origin";
import channelOverview from "./channel-overview";
import duelTower from "./duel-tower";
import standings from "./standings";
import statusBar from "./status-bar";
import subsPerShort from "./subs-per-short";
import teamRadio from "./team-radio";
import topShorts from "./top-shorts";
import trendChart from "./trend-chart";
import uploadTiming from "./upload-timing";
import uploadCalendar from "./upload-calendar";
import shortLength from "./short-length";
import catalogShare from "./catalog-share";

/**
 * ZENTRALE WIDGET-LISTE – je Seite.
 * Reihenfolge hier = Reihenfolge auf der Seite.
 * Neues Widget: Ordner in src/widgets/ anlegen, oben importieren, hier auf einer
 * (oder mehreren) Seiten eintragen. Fertig.
 */
export const PAGES: Record<DashboardPageId, WidgetDefinition[]> = {
  // „Rennen“: was gerade passiert (Startseite)
  race: [
    statusBar,
    channelOverview,
    duelTower,
    trendChart,
    // Phase 6.3: Konkurrenz-Vergleich
    standings,
    topShorts,
    // Phase 6: „Short geht ab“-Alarme
    teamRadio,
  ],
  // „Analyse“: Auswertungen in Ruhe (/analyse)
  analysis: [
    statusBar,
    // Phase 6.2: beste Upload-Uhrzeit
    uploadTiming,
    // Phase 7: Kalender, Short-Länge, Langzeit-Anteil
    uploadCalendar,
    shortLength,
    catalogShare,
    // Phase 5: YouTube Analytics (blenden sich aus, wenn die Datenquelle keine Analytics hat)
    analyticsOverview,
    subsPerShort,
    audienceOrigin,
  ],
};

/** Alle Widgets (jedes nur einmal). */
export const WIDGETS: WidgetDefinition[] = [...new Set(Object.values(PAGES).flat())];
