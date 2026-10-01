import { defineWidget } from "../types";
import { UploadTimingWidget } from "./UploadTimingWidget";

export default defineWidget({
  id: "upload-timing",
  title: "Boxenstrategie",
  description: "Beste Upload-Uhrzeit: Empfehlung, Heatmap nach Wochentag × Uhrzeit, Publikums-Aktivität und Testprotokoll.",
  size: "full",
  component: UploadTimingWidget,
});
