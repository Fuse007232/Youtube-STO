import { defineWidget } from "../types";
import { DuelTowerWidget } from "./DuelTowerWidget";

export default defineWidget({
  id: "duel-tower",
  title: "Duell · Letzte 24h",
  description:
    "Welcher Kanal hat in den letzten 24 Stunden mehr Aufrufe, Abos und Shorts gewonnen? Im Stil eines F1-Timing-Towers.",
  size: "small",
  component: DuelTowerWidget,
});
