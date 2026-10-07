import { defineWidget } from "../types";
import { ProductionStatusWidget } from "./ProductionStatusWidget";

export default defineWidget({
  id: "production-status",
  title: "Vorlauf",
  description: "Je Kanal: wie viele Tage schon fertig sind, Tagesziel, Wochenstand und beste Upload-Zeit.",
  size: "full",
  component: ProductionStatusWidget,
});
