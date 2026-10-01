import { defineWidget } from "../types";
import { ChannelOverviewWidget } from "./ChannelOverviewWidget";

export default defineWidget({
  id: "channel-overview",
  title: "Kanal-Übersicht",
  description: "Beide Kanäle nebeneinander: Abos, Gesamtaufrufe, Anzahl Shorts, Verlauf der letzten 7 Tage.",
  size: "full",
  component: ChannelOverviewWidget,
});
