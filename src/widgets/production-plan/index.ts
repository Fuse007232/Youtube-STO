import { defineWidget } from "../types";
import { ProductionPlanWidget } from "./ProductionPlanWidget";

export default defineWidget({
  id: "production-plan",
  title: "Produktionsplan",
  description: "Tage × Kanäle: was online ist, was fertig produziert/eingeplant ist und was noch fehlt.",
  size: "large",
  component: ProductionPlanWidget,
});
