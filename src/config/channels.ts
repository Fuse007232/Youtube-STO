/**
 * Die beobachteten Kanäle. Kanal-IDs sind öffentlich – kein Geheimnis.
 *
 * - `code`: Drei-Buchstaben-Kürzel wie im F1-Timing-Tower.
 * - `color`: Teamfarbe des Kanals (auf dunklem Hintergrund geprüft, auch für Farbenblinde unterscheidbar).
 * - `kind`: "own" = eigener Kanal, "competitor" = Konkurrenz (Phase 6).
 */
export type ChannelKind = "own" | "competitor";

export interface ChannelConfig {
  id: string;
  name: string;
  code: string;
  color: string;
  kind: ChannelKind;
}

export const CHANNELS: ChannelConfig[] = [
  {
    id: "UCJtW0caGhgqEWxNh2HcsGPg",
    name: "Bra1nrotvault",
    code: "BRV",
    color: "#d95926",
    kind: "own",
  },
  {
    id: "UCSxDp-sHQ49VwIz0Ix9fusA",
    name: "Granny Aura",
    code: "GRA",
    color: "#3987e5",
    kind: "own",
  },
];
