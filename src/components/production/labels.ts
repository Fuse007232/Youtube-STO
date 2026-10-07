import type { ProductionStatus, SlotState } from "@/lib/data/types";
import { addDays, weekdayOf } from "@/lib/metrics/calendar";
import { formatIsoDayShort, WEEKDAYS_SHORT } from "@/lib/format";

/** Aussehen der Plätze im Produktionsplan (F1-Farben: gelb → lila → grün). */
export const SLOT_STYLE: Record<SlotState, { label: string; box: string; dot: string }> = {
  open: {
    label: "Offen",
    box: "border-dashed border-line-strong text-muted hover:border-ink-2/40 hover:text-ink-2",
    dot: "border-[1.5px] border-dashed border-muted",
  },
  missed: {
    label: "Verpasst",
    box: "border-live/40 bg-live/10 text-ink-2",
    dot: "bg-live",
  },
  idea: {
    label: "Idee",
    box: "border-line-strong bg-surface-3/60 text-ink-2",
    dot: "border-[1.5px] border-ink-2",
  },
  produced: {
    label: "Produziert",
    box: "border-sector-worse/45 bg-sector-worse/10 text-ink",
    dot: "bg-sector-worse",
  },
  scheduled: {
    label: "Eingeplant",
    box: "border-sector-best/50 bg-sector-best/10 text-ink",
    dot: "bg-sector-best",
  },
  online: {
    label: "Online",
    box: "border-sector-improved/45 bg-sector-improved/10 text-ink",
    dot: "bg-sector-improved",
  },
};

export const STATUS_LABEL: Record<ProductionStatus, string> = {
  idea: "Idee",
  produced: "Produziert",
  scheduled: "Eingeplant",
  published: "Online",
};

/** „Heute“, „Morgen“, „Gestern“ oder „Mi 08.10.“ */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Heute";
  if (day === addDays(today, 1)) return "Morgen";
  if (day === addDays(today, -1)) return "Gestern";
  return `${WEEKDAYS_SHORT[weekdayOf(day)]} ${formatIsoDayShort(day)}`;
}

/** Auswahl für „Einplanen“: heute bis in `ahead` Tagen. */
export function dayOptions(today: string, ahead = 14, back = 0): { day: string; label: string }[] {
  const out: { day: string; label: string }[] = [];
  for (let i = -back; i <= ahead; i++) {
    const day = addDays(today, i);
    const base = dayLabel(day, today);
    out.push({ day, label: i >= -1 && i <= 1 ? `${base} (${formatIsoDayShort(day)})` : base });
  }
  return out;
}

/** Vorlauf-Ampel: rot < 1 Tag, gelb 1–2, grün ab 3. */
export function bufferTone(days: number): "red" | "yellow" | "green" {
  return days < 1 ? "red" : days < 3 ? "yellow" : "green";
}
