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
import commentPulse from "./comment-pulse";
import rivalRadar from "./rival-radar";

/**
 * ZENTRALE WIDGET-LISTE – je Bereich.
 * Reihenfolge hier = Reihenfolge auf der Seite.
 * Neues Widget: Ordner in src/widgets/ anlegen, oben importieren, hier in einem
 * (oder mehreren) Bereichen eintragen. Fertig.
 */
export const PAGES: Record<DashboardPageId, WidgetDefinition[]> = {
  // „Rennen“ (/): was gerade passiert
  race: [statusBar, channelOverview, duelTower, trendChart, topShorts, teamRadio, commentPulse],
  // „Strategie“ (/strategie): wann, wie lang, wie oft hochladen
  strategy: [statusBar, uploadTiming, shortLength, catalogShare, uploadCalendar],
  // „Analyse“ (/analyse): YouTube Analytics (blendet sich aus, wenn die Quelle keine Analytics hat)
  analysis: [statusBar, analyticsOverview, subsPerShort, audienceOrigin],
  // „Konkurrenz“ (/konkurrenz): Fahrerwertung + Radar
  rivals: [statusBar, standings, rivalRadar],
};

/** Alle Widgets (jedes nur einmal). */
export const WIDGETS: WidgetDefinition[] = [...new Set(Object.values(PAGES).flat())];
