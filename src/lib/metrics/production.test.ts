import { describe, expect, it } from "vitest";
import type { ProductionItem, PublishedShort } from "@/lib/data/types";
import { buildTracker, nextStatus, reminderLines } from "./production";

const NOW = Date.UTC(2026, 9, 7, 10, 0); // Mi 07.10.2026, 12:00 Berlin
let nextId = 1;
const item = (channelId: string, day: string | null, status: ProductionItem["status"], title = ""): ProductionItem => ({
  id: nextId++,
  channelId,
  day,
  title,
  status,
  note: "",
  link: null,
  createdAt: nextId,
});
const short = (channelId: string, iso: string, id = `v${nextId++}`): PublishedShort => ({
  id,
  channelId,
  title: id,
  thumbnailUrl: null,
  publishedAt: Date.parse(iso),
  views: 1000,
});

describe("buildTracker", () => {
  it("Zeitstrahl von vorgestern bis +7 Tage, Plätze nach Tagesziel, verpasst in der Vergangenheit", () => {
    const v = buildTracker({ channelIds: ["A"], items: [], published: [], targets: { A: 1 }, now: NOW });
    expect(v.today).toBe("2026-10-07");
    expect(v.days.map((d) => d.day)[0]).toBe("2026-10-05");
    expect(v.days).toHaveLength(10);
    expect(v.days[0].cells[0].slots.map((s) => s.state)).toEqual(["missed"]);
    expect(v.days[2].cells[0].slots.map((s) => s.state)).toEqual(["open"]);
    expect(v.days[2].isToday).toBe(true);
  });

  it("echter Upload hakt automatisch ab und übernimmt den eingeplanten Eintrag", () => {
    const planned = item("A", "2026-10-07", "scheduled", "Oma tanzt");
    const v = buildTracker({
      channelIds: ["A"],
      items: [planned, item("A", "2026-10-07", "idea", "Reserve")],
      published: [short("A", "2026-10-07T11:00:00Z", "yt1")],
      targets: { A: 1 },
      now: NOW,
    });
    const cell = v.days[2].cells[0];
    expect(cell.slots.map((s) => s.state)).toEqual(["online", "idea"]);
    expect(cell.slots[0].item?.title).toBe("Oma tanzt");
    expect(cell.slots[0].short?.id).toBe("yt1");
    expect(cell.complete).toBe(true);
  });

  it("Upload um 23:30 Berliner Zeit zählt zum richtigen Tag", () => {
    const v = buildTracker({ channelIds: ["A"], items: [], published: [short("A", "2026-10-06T21:30:00Z")], targets: { A: 1 }, now: NOW });
    expect(v.days.find((d) => d.day === "2026-10-06")!.cells[0].online).toBe(1);
  });

  it("Vorlauf, fertige Shorts und Wochenziel", () => {
    const v = buildTracker({
      channelIds: ["A", "B"],
      items: [
        item("A", "2026-10-07", "scheduled"),
        item("A", "2026-10-08", "produced"),
        item("A", "2026-10-09", "produced"),
        item("A", "2026-10-11", "produced"), // Lücke am 10. → zählt nicht zum Vorlauf
        item("A", null, "idea", "Parkplatz"),
      ],
      published: [short("A", "2026-10-05T11:00:00Z"), short("A", "2026-10-06T11:00:00Z"), short("B", "2026-10-06T11:00:00Z")],
      targets: { A: 1, B: 2 },
      now: NOW,
    });
    const a = v.summary.find((s) => s.channelId === "A")!;
    expect(a).toMatchObject({ bufferDays: 3, readyCount: 4, todayReady: 1, todayOpen: 0, weekOnline: 2, weekTarget: 7 });
    const b = v.summary.find((s) => s.channelId === "B")!;
    expect(b).toMatchObject({ bufferDays: 0, todayOpen: 2, weekOnline: 1, weekTarget: 14 });
    expect(v.backlog.map((i) => i.title)).toEqual(["Parkplatz"]);
    // B: Ziel 2, nur 1 Upload am 06. → 1 online + 1 verpasst
    expect(v.days.find((d) => d.day === "2026-10-06")!.cells[1].slots.map((s) => s.state)).toEqual(["online", "missed"]);
  });

  it("Tagesziel 0: nichts offen, kein Vorlauf", () => {
    const v = buildTracker({ channelIds: ["A"], items: [], published: [], targets: { A: 0 }, now: NOW });
    expect(v.days[2].cells[0].slots).toEqual([]);
    expect(v.summary[0]).toMatchObject({ todayOpen: 0, bufferDays: 0 });
  });
});

describe("nextStatus", () => {
  it("offen → produziert → eingeplant → offen", () => {
    expect(nextStatus("open")).toBe("produced");
    expect(nextStatus("missed")).toBe("produced");
    expect(nextStatus("idea")).toBe("produced");
    expect(nextStatus("produced")).toBe("scheduled");
    expect(nextStatus("scheduled")).toBeNull();
  });
});

describe("18-Uhr-Erinnerung", () => {
  it("meldet fehlende und noch nicht hochgeladene Shorts, eingeplante zählen als erledigt", () => {
    const v = buildTracker({
      channelIds: ["A", "B", "C", "D"],
      items: [
        item("B", "2026-10-07", "produced"),
        item("C", "2026-10-07", "scheduled"),
        item("D", "2026-10-07", "idea", "nur Idee"),
      ],
      published: [short("A", "2026-10-07T08:00:00Z")],
      targets: { A: 2, B: 1, C: 1, D: 1 },
      now: NOW,
    });
    expect(reminderLines(v)).toEqual([
      { channelId: "A", target: 2, missing: 1, toUpload: 0 },
      { channelId: "B", target: 1, missing: 0, toUpload: 1 },
      { channelId: "D", target: 1, missing: 1, toUpload: 0 },
    ]);
  });

  it("Tagesziel 0 = Pause, keine Meldung", () => {
    const v = buildTracker({ channelIds: ["A"], items: [], published: [], targets: { A: 0 }, now: NOW });
    expect(reminderLines(v)).toEqual([]);
  });
});
