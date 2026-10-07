import { describe, expect, it } from "vitest";
import { CHANNELS } from "@/config/channels";
import { TrackerInputError, parseItemInput, parseTarget } from "./validate";

const ch = CHANNELS[0].id;

describe("parseItemInput", () => {
  it("Anlegen: Kanal Pflicht, Tag leer = Ideen-Parkplatz, Texte gekürzt", () => {
    expect(parseItemInput({ channelId: ch, title: "  Idee  " }, true)).toEqual({ channelId: ch, day: null, title: "Idee" });
    expect(() => parseItemInput({ title: "x" }, true)).toThrow(TrackerInputError);
  });

  it("prüft Datum, Status und Link", () => {
    expect(parseItemInput({ day: "2026-10-08", status: "produced" }, false)).toEqual({ day: "2026-10-08", status: "produced" });
    expect(() => parseItemInput({ day: "8.10." }, false)).toThrow("Datum");
    expect(() => parseItemInput({ status: "fertig" }, false)).toThrow("Status");
    expect(parseItemInput({ link: "https://youtube.com/shorts/abc" }, false).link).toBe("https://youtube.com/shorts/abc");
    expect(() => parseItemInput({ link: "javascript:alert(1)" }, false)).toThrow("http");
    expect(parseItemInput({ link: "" }, false).link).toBeNull();
    expect(() => parseItemInput({ title: "x".repeat(201) }, false)).toThrow("zu lang");
  });
});

describe("parseTarget", () => {
  it("0 bis 10 Shorts pro Tag", () => {
    expect(parseTarget({ channelId: ch, perDay: 2 })).toEqual({ channelId: ch, perDay: 2 });
    expect(() => parseTarget({ channelId: ch, perDay: 11 })).toThrow();
    expect(() => parseTarget({ channelId: "x", perDay: 1 })).toThrow("Kanal");
  });
});
