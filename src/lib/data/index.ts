import "server-only";
import { MockDataSource } from "./mock/MockDataSource";
import type { DataSource, DataSourceKind } from "./types";

/**
 * Wählt die Datenquelle anhand der Umgebungsvariable DATA_SOURCE.
 * Standard (und in Phase 1 einzige Möglichkeit): "mock" = Beispieldaten.
 * Phase 2 ergänzt "youtube", Phase 3 "database".
 */
export function getDataSource(): DataSource {
  const kind = (process.env.DATA_SOURCE ?? "mock") as DataSourceKind;
  switch (kind) {
    case "mock":
    default:
      return new MockDataSource();
  }
}
