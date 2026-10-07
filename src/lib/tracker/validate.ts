import { CHANNELS } from "@/config/channels";
import type { ProductionStatus } from "@/lib/data/types";
import type { ProductionItemPatch } from "@/lib/db/store";

/** Prüft Eingaben für Produktions-Einträge (aus dem Browser → nie blind vertrauen). */

const STATUSES: ProductionStatus[] = ["idea", "produced", "scheduled", "published"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class TrackerInputError extends Error {}

function text(v: unknown, field: string, max: number): string {
  if (typeof v !== "string") throw new TrackerInputError(`${field} muss Text sein.`);
  const t = v.trim();
  if (t.length > max) throw new TrackerInputError(`${field} ist zu lang (max. ${max} Zeichen).`);
  return t;
}

/** Felder eines Eintrags; `requireChannel` beim Anlegen. */
export function parseItemInput(body: unknown, requireChannel: boolean): ProductionItemPatch {
  if (!body || typeof body !== "object") throw new TrackerInputError("Ungültige Anfrage.");
  const b = body as Record<string, unknown>;
  const out: ProductionItemPatch = {};

  if (b.channelId !== undefined || requireChannel) {
    if (!CHANNELS.some((c) => c.id === b.channelId)) throw new TrackerInputError("Unbekannter Kanal.");
    out.channelId = b.channelId as string;
  }
  if (b.day !== undefined) {
    if (b.day !== null && (typeof b.day !== "string" || !DAY.test(b.day) || Number.isNaN(Date.parse(b.day)))) {
      throw new TrackerInputError("Ungültiges Datum.");
    }
    out.day = b.day as string | null;
  } else if (requireChannel) {
    out.day = null;
  }
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status as ProductionStatus)) throw new TrackerInputError("Ungültiger Status.");
    out.status = b.status as ProductionStatus;
  }
  if (b.title !== undefined) out.title = text(b.title, "Titel", 200);
  if (b.note !== undefined) out.note = text(b.note, "Notiz", 2000);
  if (b.link !== undefined) {
    if (b.link === null || b.link === "") out.link = null;
    else {
      const l = text(b.link, "Link", 500);
      let url: URL;
      try {
        url = new URL(l);
      } catch {
        throw new TrackerInputError("Link ist keine gültige Adresse.");
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new TrackerInputError("Link muss mit http(s):// beginnen.");
      out.link = url.toString();
    }
  }
  return out;
}

export function parseTarget(body: unknown): { channelId: string; perDay: number } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!CHANNELS.some((c) => c.id === b.channelId)) throw new TrackerInputError("Unbekannter Kanal.");
  const n = Number(b.perDay);
  if (!Number.isInteger(n) || n < 0 || n > 10) throw new TrackerInputError("Tagesziel muss zwischen 0 und 10 liegen.");
  return { channelId: b.channelId as string, perDay: n };
}
