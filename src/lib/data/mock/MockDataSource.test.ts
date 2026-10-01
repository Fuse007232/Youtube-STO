import { describe, expect, it } from "vitest";
import { MockDataSource } from "./MockDataSource";

describe("MockDataSource", () => {
  const now = Date.UTC(2026, 9, 1, 14, 7);

  it("liefert realistische Größenordnungen für beide Kanäle", async () => {
    const data = await new MockDataSource().getDashboard(now);
    expect(data.isDemo).toBe(true);
    expect(data.channels).toHaveLength(2);
    const [brv, gra] = data.channels;
    expect(brv.current.subscribers).toBeGreaterThan(90_000);
    expect(brv.current.subscribers).toBeLessThan(115_000);
    expect(gra.current.subscribers).toBeGreaterThan(24_000);
    expect(gra.current.subscribers).toBeLessThan(33_000);
    expect(brv.current.videoCount).toBeGreaterThanOrEqual(345);
    expect(gra.current.videoCount).toBeGreaterThanOrEqual(98);
  });

  it("hat 24h-Verlauf in 15-Minuten-Schritten und sinnvolle Gewinne", async () => {
    const data = await new MockDataSource().getDashboard(now);
    for (const c of data.channels) {
      expect(c.history24h.length).toBe(97);
      expect(c.delta24h.views).toBeGreaterThan(0);
      expect(c.prevDelta24h).not.toBeNull();
      expect(c.rate.viewsPerSecond).toBeGreaterThan(0);
    }
    expect(data.lastSnapshotAt).toBe(Date.UTC(2026, 9, 1, 14, 0));
  });

  it("ist vorhersagbar: gleicher Zeitpunkt → gleiche Zahlen", async () => {
    const a = await new MockDataSource().getDashboard(now);
    const b = await new MockDataSource().getDashboard(now + 60_000);
    expect(a.channels[0].current).toEqual(b.channels[0].current);
  });

  it("liefert Top-Shorts für alle Zeiträume", async () => {
    const data = await new MockDataSource().getDashboard(now);
    expect(data.topShorts["24h"].length).toBeGreaterThan(0);
    expect(data.topShorts["7d"].length).toBeGreaterThan(0);
    expect(data.topShorts.all.length).toBe(20);
  });
});
