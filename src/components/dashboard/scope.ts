import type { DashboardData } from "@/lib/data/types";

/** Auswertungs-Bereich „alle Konkurrenten zusammen“. */
export const COMPETITORS_SCOPE = "competitors";

/** Beschriftungen für einen Kanal-Umschalter: Kanal-Kürzel bzw. „Konkurrenz“. */
export function scopeOptions(data: DashboardData, scopes: string[]): { value: string; label: string }[] {
  return scopes.map((scope) => ({
    value: scope,
    label:
      scope === COMPETITORS_SCOPE
        ? "Konkurrenz"
        : (data.channels.find((c) => c.channel.id === scope)?.channel.code ?? "?"),
  }));
}
