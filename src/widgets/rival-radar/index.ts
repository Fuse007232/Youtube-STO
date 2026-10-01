import { defineWidget } from "../types";
import { RivalRadarWidget } from "./RivalRadarWidget";

export default defineWidget({
  id: "rival-radar",
  title: "Konkurrenz-Radar",
  description: "Konkurrenz-Shorts, die gerade ungewöhnlich abgehen – als Ideen-Quelle.",
  size: "medium",
  component: RivalRadarWidget,
});
