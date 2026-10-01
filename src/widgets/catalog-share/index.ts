import { defineWidget } from "../types";
import { CatalogShareWidget } from "./CatalogShareWidget";

export default defineWidget({
  id: "catalog-share",
  title: "Reifenverschleiß",
  description: "Woher kommen die Aufrufe – von neuen Shorts oder vom Katalog? Plus Dauerläufer.",
  size: "medium",
  component: CatalogShareWidget,
});
