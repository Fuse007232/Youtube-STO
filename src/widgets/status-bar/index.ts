import { defineWidget } from "../types";
import { StatusBarWidget } from "./StatusBarWidget";

export default defineWidget({
  id: "status-bar",
  title: "Status",
  description: "Datenquelle, letzter und nächster Schnappschuss, Hochrechnung, API-Kontingent.",
  size: "full",
  component: StatusBarWidget,
});
