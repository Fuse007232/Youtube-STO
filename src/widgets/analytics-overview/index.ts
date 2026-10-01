import { defineWidget } from "../types";
import { AnalyticsOverviewWidget } from "./AnalyticsOverviewWidget";

export default defineWidget({
  id: "analytics-overview",
  title: "Analytics · 28 Tage",
  description:
    "YouTube Analytics je Kanal (letzte 28 Tage): exakte Abo-Gewinne, Watchtime, Zuschauerbindung, Engaged Views + Abo-Verlauf pro Tag.",
  size: "full",
  component: AnalyticsOverviewWidget,
});
