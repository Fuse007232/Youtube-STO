import type { WidgetDefinition } from "./types";
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
  // Phase 6.3: Konkurrenz-Vergleich
  standings,
  topShorts,
  // Phase 6: „Short geht ab“-Alarme
  teamRadio,
  // Phase 5: YouTube Analytics (blenden sich aus, wenn die Datenquelle keine Analytics hat)
  analyticsOverview,
  subsPerShort,
  audienceOrigin,
];
