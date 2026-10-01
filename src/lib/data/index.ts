import "server-only";
import { after } from "next/server";
import { SupabaseStore } from "@/lib/db/SupabaseStore";
import { getSupabase } from "@/lib/db/supabase";
import { runSnapshotIfDue } from "@/lib/snapshot/run-snapshot";
import { YouTubeDataClient } from "@/lib/youtube/client";
import { DatabaseDataSource } from "./database/DatabaseDataSource";
import { MockDataSource } from "./mock/MockDataSource";
import { resolveDataSourceKind } from "./resolve-kind";
import type { DataSource } from "./types";
import { YouTubeDataSource } from "./youtube/YouTubeDataSource";

/** Wählt die Datenquelle (siehe resolve-kind.ts) und verdrahtet sie. */
export function getDataSource(): DataSource {
  const kind = resolveDataSourceKind();
  const youtubeKey = process.env.YOUTUBE_API_KEY;

  switch (kind) {
    case "database": {
      const store = new SupabaseStore(getSupabase());
      return new DatabaseDataSource(store, {
        // Selbstauslöser: überfälligen Schnappschuss nach der Antwort im Hintergrund holen.
        onStale: youtubeKey
          ? () =>
              after(() =>
                runSnapshotIfDue({
                  store,
                  client: new YouTubeDataClient(youtubeKey),
                  trigger: "dashboard",
                }).catch((e) => console.error("[snapshot] Selbstauslöser fehlgeschlagen:", e)),
              )
          : undefined,
        // Noch leer? Dann solange die Zahlen direkt von YouTube zeigen.
        fallback: youtubeKey ? youtubeSource(youtubeKey) : undefined,
        analytics: store,
      });
    }
    case "youtube": {
      if (!youtubeKey) {
        throw new Error(
          "DATA_SOURCE ist auf „youtube“ gestellt, aber YOUTUBE_API_KEY fehlt. Bitte in Vercel unter Settings → Environment Variables eintragen.",
        );
      }
      return youtubeSource(youtubeKey);
    }
    case "mock":
    default:
      return new MockDataSource();
  }
}

function youtubeSource(key: string): YouTubeDataSource {
  return new YouTubeDataSource(key, fetch, (task) => after(task));
}
