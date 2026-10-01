import { defineWidget } from "../types";
import { ShortLengthWidget } from "./ShortLengthWidget";

export default defineWidget({
  id: "short-length",
  title: "Renndistanz",
  description: "Welche Short-Länge läuft am besten? Fairer Leistungs-Index nach Dauer.",
  size: "medium",
  component: ShortLengthWidget,
});
