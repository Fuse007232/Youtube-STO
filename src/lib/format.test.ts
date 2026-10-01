import { describe, expect, it } from "vitest";
import { formatHourRange, formatIndex, zoneShiftHours } from "./format";

describe("Boxenstrategie-Formate", () => {
  it("Index und Zeitfenster", () => {
    expect(formatIndex(1.46)).toBe("1,5×");
    expect(formatIndex(1)).toBe("1,0×");
    expect(formatHourRange(12)).toBe("12–14 Uhr");
    expect(formatHourRange(-2, 2, "")).toBe("22–24");
  });

  it("Zeitverschiebung Berlin → New York (auch über Monats- und Zeitumstellungsgrenzen)", () => {
    expect(zoneShiftHours("America/New_York", Date.UTC(2026, 9, 1, 12))).toBe(-6);
    // 1. Nov. 0:30 Berlin = 31. Okt. abends in New York
    expect(zoneShiftHours("America/New_York", Date.UTC(2026, 9, 31, 23, 30))).toBe(-5); // Berlin schon Winterzeit, NY noch Sommerzeit
    expect(zoneShiftHours("Europe/Berlin", Date.UTC(2026, 9, 1, 12))).toBe(0);
  });
});
