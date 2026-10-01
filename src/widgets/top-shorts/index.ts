import { defineWidget } from "../types";
import { TopShortsWidget } from "./TopShortsWidget";

export default defineWidget({
  id: "top-shorts",
  title: "Top Shorts",
  description: "Rangliste der besten Shorts nach Aufrufen: letzte 24h, letzte 7 Tage oder insgesamt – filterbar nach Kanal.",
  size: "large",
  component: TopShortsWidget,
});
