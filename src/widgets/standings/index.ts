import { defineWidget } from "../types";
import { StandingsWidget } from "./StandingsWidget";

export default defineWidget({
  id: "standings",
  title: "Fahrerwertung",
  description:
    "Deine Kanäle und deine Konkurrenten als Rangliste: Aufrufe 24h, Abos, Tempo, Ø Aufrufe pro Short, Uploads – umschaltbar, mit Abstand zum Führenden.",
  size: "full",
  component: StandingsWidget,
});
