import type { WidgetDefinition } from "./types";
import channelOverview from "./channel-overview";
import duelTower from "./duel-tower";
import statusBar from "./status-bar";
import topShorts from "./top-shorts";
import trendChart from "./trend-chart";

/**
 * ZENTRALE WIDGET-LISTE
 * Reihenfolge hier = Reihenfolge im Dashboard.
 * Neues Widget: Ordner in src/widgets/ anlegen, oben importieren, hier eintragen. Fertig.
 */
export const WIDGETS: WidgetDefinition[] = [
  statusBar,
  channelOverview,
  duelTower,
  trendChart,
  topShorts,
];
