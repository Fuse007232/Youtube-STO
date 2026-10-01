import { defineWidget } from "../types";
import { TrendChartWidget } from "./TrendChartWidget";

export default defineWidget({
  id: "trend-chart",
  title: "Rennverlauf",
  description:
    "Gewinn an Aufrufen bzw. Abos seit Beginn des Zeitraums (24h oder 7 Tage) – beide Kanäle im direkten Vergleich.",
  size: "large",
  component: TrendChartWidget,
});
