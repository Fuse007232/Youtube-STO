import { pick } from "./random";

/** Erfundene Beispiel-Titel, damit die Rangliste realistisch aussieht. */

const BRAINROT = {
  start: ["POV:", "Wenn", "Niemand:", "Bro", "Der Moment wenn", "Ich wenn", "Level 100"],
  middle: [
    "Sigma Katze",
    "der NPC",
    "Skibidi Lehrer",
    "Rizz-Gott",
    "der Mathe-Test",
    "mein Kühlschrank",
    "der Bus-Fahrer",
    "Aura-Farmer",
    "Goofy Hamster",
  ],
  end: [
    "eskaliert komplett 💀",
    "hat zu viel Aura",
    "um 3 Uhr nachts",
    "aber in 4K",
    "(+1000 Aura)",
    "– Teil 2",
    "geht viral 😭",
    "ohne Kontext",
  ],
} as const;

const GRANNY = {
  start: ["Oma", "Granny", "Omi", "Meine Oma", "Oma Hilde"],
  middle: [
    "reagiert auf",
    "erklärt",
    "testet",
    "bewertet",
    "entdeckt",
    "zockt",
    "kocht",
  ],
  end: [
    "Brainrot-Slang 😂",
    "TikTok-Trends",
    "ihren ersten Energy-Drink",
    "Gen-Z-Wörter",
    "Fortnite",
    "Rizz",
    "Aura-Punkte",
    "ein Fidget Toy",
  ],
} as const;

export function makeTitle(
  style: "brainrot" | "granny",
  rand: () => number,
  index: number,
): string {
  const words = style === "brainrot" ? BRAINROT : GRANNY;
  const title = `${pick(rand, words.start)} ${pick(rand, words.middle)} ${pick(rand, words.end)}`;
  // Ab und zu eine Folgennummer, damit sich Titel seltener doppeln.
  return rand() < 0.3 ? `${title} #${(index % 40) + 1}` : title;
}
