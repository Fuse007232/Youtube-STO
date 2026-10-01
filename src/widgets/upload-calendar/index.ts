import { defineWidget } from "../types";
import { UploadCalendarWidget } from "./UploadCalendarWidget";

export default defineWidget({
  id: "upload-calendar",
  title: "Upload-Kalender",
  description: "Kalender-Raster der letzten 26 Wochen: Aufrufe pro Tag, Uploads und Upload-Serien je Kanal.",
  size: "full",
  component: UploadCalendarWidget,
});
