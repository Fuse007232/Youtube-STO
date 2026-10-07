import { defineWidget } from "../types";
import { IdeaParkingWidget } from "./IdeaParkingWidget";

export default defineWidget({
  id: "idea-parking",
  title: "Ideen-Parkplatz",
  description: "Short-Ideen ohne festen Tag sammeln und später einplanen.",
  size: "small",
  component: IdeaParkingWidget,
});
