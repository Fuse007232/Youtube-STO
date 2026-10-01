import { defineWidget } from "../types";
import { TeamRadioWidget } from "./TeamRadioWidget";

export default defineWidget({
  id: "team-radio",
  title: "Boxenfunk",
  description: "„Short geht ab“-Alarme der letzten 7 Tage (Raketenstart / Ausbruch), wie Teamfunk in der F1.",
  size: "small",
  component: TeamRadioWidget,
});
