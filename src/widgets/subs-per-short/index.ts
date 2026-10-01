import { defineWidget } from "../types";
import { SubsPerShortWidget } from "./SubsPerShortWidget";

export default defineWidget({
  id: "subs-per-short",
  title: "Abo-Magneten",
  description: "Welche Shorts bringen die meisten neuen Abos (YouTube Analytics, 28 Tage) – mit Abos pro 1.000 Aufrufe und Zuschauerbindung.",
  size: "large",
  component: SubsPerShortWidget,
});
