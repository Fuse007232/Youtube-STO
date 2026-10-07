import type {
  ChannelProductionSummary,
  ProductionItem,
  ProductionStatus,
  PublishedShort,
  SlotState,
  TrackerCell,
  TrackerDay,
  TrackerSlot,
  TrackerView,
} from "@/lib/data/types";
import { addDays, berlinDay, weekdayOf } from "./calendar";

/**
 * Produktion („Boxengasse“, Phase 9): Tages-Tracker je Kanal.
 * - Plätze je Tag = Tagesziel (+ alles, was zusätzlich geplant oder online ist)
 * - Echte Uploads des Tages haken automatisch ab („online“) und werden – falls
 *   vorhanden – dem passendsten geplanten Eintrag zugeordnet
 * - Vorlauf: so viele Tage ab heute sind abgedeckt (online oder fertig)
 */

export const TRACKER = {
  /** Sichtbarer Zeitstrahl: Tage vor bzw. nach heute. */
  daysBefore: 2,
  daysAfter: 7,
  /** So weit voraus zählt der Vorlauf höchstens. */
  bufferHorizon: 30,
} as const;

/** Nächster Status beim Antippen: offen → produziert → eingeplant → offen. */
export function nextStatus(state: SlotState): ProductionStatus | null {
  switch (state) {
    case "open":
    case "missed":
    case "idea":
      return "produced";
    case "produced":
      return "scheduled";
    case "scheduled":
      return null; // zurück auf offen
    case "online":
      return "published";
  }
}

/** Reihenfolge, in der echte Uploads geplanten Einträgen zugeordnet werden. */
const MATCH_ORDER: ProductionStatus[] = ["published", "scheduled", "produced", "idea"];

function cellFor(input: {
  day: string;
  today: string;
  channelId: string;
  target: number;
  items: ProductionItem[];
  published: PublishedShort[];
}): TrackerCell {
  const items = [...input.items].sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  const shorts = [...input.published].sort((a, b) => a.publishedAt - b.publishedAt);
  const used = new Set<number>();
  const slots: TrackerSlot[] = [];

  // 1) Echte Uploads → online (mit passendem Eintrag, falls geplant)
  for (const short of shorts) {
    let match: ProductionItem | null = null;
    for (const status of MATCH_ORDER) {
      match = items.find((i) => !used.has(i.id) && i.status === status) ?? null;
      if (match) break;
    }
    if (match) used.add(match.id);
    slots.push({ key: `yt-${short.id}`, state: "online", item: match, short });
  }
  // 2) Übrige Einträge mit ihrem Status (von Hand „online“ markiert zählt als online).
  //    Schlüssel nach Position: ein Platz bleibt derselbe, egal ob offen, produziert
  //    oder eingeplant (kein Flackern, wenn ein Eintrag gespeichert wird).
  const slotKey = (n: number) => `slot-${input.day}-${input.channelId}-${n}`;
  let n = 0;
  for (const item of items) {
    if (used.has(item.id)) continue;
    const state: SlotState = item.status === "published" ? "online" : item.status;
    slots.push({ key: slotKey(n++), state, item, short: null });
  }
  // 3) Auf das Tagesziel auffüllen: offen bzw. (in der Vergangenheit) verpasst
  const isPast = input.day < input.today;
  for (let i = slots.length; i < input.target; i++) {
    slots.push({ key: slotKey(n++), state: isPast ? "missed" : "open", item: null, short: null });
  }

  const online = slots.filter((s) => s.state === "online").length;
  const ready = slots.filter((s) => s.state === "produced" || s.state === "scheduled").length;
  return {
    channelId: input.channelId,
    target: input.target,
    slots,
    online,
    ready,
    complete: online >= input.target,
  };
}

/** Berliner Montag der Woche von `day`. */
function mondayOf(day: string): string {
  return addDays(day, -weekdayOf(day));
}

export function buildTracker(input: {
  channelIds: string[];
  items: ProductionItem[];
  published: PublishedShort[];
  targets: Record<string, number>;
  now: number;
  daysBefore?: number;
  daysAfter?: number;
}): TrackerView {
  const today = berlinDay(input.now);
  const before = input.daysBefore ?? TRACKER.daysBefore;
  const after = input.daysAfter ?? TRACKER.daysAfter;
  const targetOf = (id: string) => input.targets[id] ?? 1;

  const publishedByKey = new Map<string, PublishedShort[]>();
  for (const p of input.published) {
    const key = `${p.channelId}|${berlinDay(p.publishedAt)}`;
    publishedByKey.set(key, [...(publishedByKey.get(key) ?? []), p]);
  }
  const itemsByKey = new Map<string, ProductionItem[]>();
  for (const i of input.items) {
    if (!i.day) continue;
    const key = `${i.channelId}|${i.day}`;
    itemsByKey.set(key, [...(itemsByKey.get(key) ?? []), i]);
  }
  const cell = (channelId: string, day: string) =>
    cellFor({
      day,
      today,
      channelId,
      target: targetOf(channelId),
      items: itemsByKey.get(`${channelId}|${day}`) ?? [],
      published: publishedByKey.get(`${channelId}|${day}`) ?? [],
    });

  const days: TrackerDay[] = [];
  for (let d = addDays(today, -before); d <= addDays(today, after); d = addDays(d, 1)) {
    days.push({
      day: d,
      weekday: weekdayOf(d),
      isToday: d === today,
      isPast: d < today,
      cells: input.channelIds.map((id) => cell(id, d)),
    });
  }

  const monday = mondayOf(today);
  const summary: ChannelProductionSummary[] = input.channelIds.map((channelId) => {
    const target = targetOf(channelId);
    const todayCell = cell(channelId, today);
    // Vorlauf: aufeinanderfolgende abgedeckte Tage ab heute
    let bufferDays = 0;
    let readyCount = 0;
    for (let i = 0; i <= TRACKER.bufferHorizon; i++) {
      const c = cell(channelId, addDays(today, i));
      readyCount += c.ready;
      if (target > 0 && bufferDays === i && c.online + c.ready >= target) bufferDays++;
    }
    let weekOnline = 0;
    for (let i = 0; i < 7; i++) weekOnline += cell(channelId, addDays(monday, i)).online;
    return {
      channelId,
      target,
      todayOnline: todayCell.online,
      todayReady: todayCell.ready,
      todayOpen: Math.max(0, target - todayCell.online - todayCell.ready),
      bufferDays,
      readyCount,
      weekOnline,
      weekTarget: target * 7,
    };
  });

  return {
    today,
    days,
    backlog: input.items.filter((i) => i.day === null).sort((a, b) => b.createdAt - a.createdAt),
    targets: Object.fromEntries(input.channelIds.map((id) => [id, targetOf(id)])),
    summary,
  };
}
