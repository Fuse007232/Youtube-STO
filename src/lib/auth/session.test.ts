import { describe, expect, it } from "vitest";
import {
  checkPassword,
  createSessionToken,
  isAuthRequired,
  isRequestAllowed,
  safeNextPath,
  verifySessionToken,
} from "./session";

const ENV = { DASHBOARD_PASSWORD: "richtig-langes-passwort", SESSION_SECRET: "geheim", NODE_ENV: "production" };
const NOW = Date.UTC(2026, 9, 1, 12, 0);
const DAY = 86_400_000;

describe("Passwortschutz", () => {
  it("prüft das Passwort", () => {
    expect(checkPassword("richtig-langes-passwort", ENV)).toBe(true);
    expect(checkPassword("falsch", ENV)).toBe(false);
    expect(checkPassword("", ENV)).toBe(false);
  });

  it("ohne eingerichtetes Passwort kommt niemand rein (online)", () => {
    const env = { NODE_ENV: "production" };
    expect(isAuthRequired(env)).toBe(true);
    expect(checkPassword("", env)).toBe(false);
    expect(isRequestAllowed(undefined, env)).toBe(false);
  });

  it("lokal ohne Passwort ist alles offen (Entwicklung)", () => {
    expect(isRequestAllowed(undefined, { NODE_ENV: "development" })).toBe(true);
  });

  it("gültiges Token wird 30 Tage akzeptiert", () => {
    const token = createSessionToken(NOW, ENV);
    expect(verifySessionToken(token, NOW + 29 * DAY, ENV)).toBe(true);
    expect(verifySessionToken(token, NOW + 31 * DAY, ENV)).toBe(false);
  });

  it("gefälschte oder kaputte Tokens werden abgelehnt", () => {
    const token = createSessionToken(NOW, ENV);
    const [exp, sig] = token.split(".");
    expect(verifySessionToken(`${Number(exp) + 999999}.${sig}`, NOW, ENV)).toBe(false);
    expect(verifySessionToken(`${exp}.abc`, NOW, ENV)).toBe(false);
    expect(verifySessionToken("quatsch", NOW, ENV)).toBe(false);
    expect(verifySessionToken(undefined, NOW, ENV)).toBe(false);
  });

  it("Passwort ändern meldet alle ab", () => {
    const token = createSessionToken(NOW, ENV);
    expect(verifySessionToken(token, NOW, { ...ENV, DASHBOARD_PASSWORD: "neu" })).toBe(false);
  });

  it("anderes SESSION_SECRET macht Tokens ungültig", () => {
    const token = createSessionToken(NOW, ENV);
    expect(verifySessionToken(token, NOW, { ...ENV, SESSION_SECRET: "anders" })).toBe(false);
  });

  it("leitet nur innerhalb der App weiter", () => {
    expect(safeNextPath("/api/dashboard")).toBe("/api/dashboard");
    expect(safeNextPath("//boese.de")).toBe("/");
    expect(safeNextPath("https://boese.de")).toBe("/");
    expect(safeNextPath("/\\boese.de")).toBe("/");
    expect(safeNextPath(null)).toBe("/");
  });
});
