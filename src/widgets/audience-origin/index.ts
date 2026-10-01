import { defineWidget } from "../types";
import { AudienceOriginWidget } from "./AudienceOriginWidget";

export default defineWidget({
  id: "audience-origin",
  title: "Zuschauer-Herkunft",
  description: "Woher die Aufrufe kommen: Traffic-Quellen (z. B. Shorts-Feed, Suche) und Länder (YouTube Analytics, 28 Tage).",
  size: "small",
  component: AudienceOriginWidget,
});
