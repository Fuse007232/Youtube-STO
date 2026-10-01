import "server-only";
import { after } from "next/server";
import { MockDataSource } from "./mock/MockDataSource";
import { resolveDataSourceKind } from "./resolve-kind";
import type { DataSource } from "./types";
import { YouTubeDataSource } from "./youtube/YouTubeDataSource";

export function getDataSource(): DataSource {
  const kind = resolveDataSourceKind();
  switch (kind) {
    case "youtube": {
      const key = process.env.YOUTUBE_API_KEY;
      if (!key) {
        throw new Error(
          "DATA_SOURCE ist auf „youtube“ gestellt, aber YOUTUBE_API_KEY fehlt. Bitte in Vercel unter Settings → Environment Variables eintragen.",
        );
      }
      return new YouTubeDataSource(key, fetch, (task) => after(task));
    }
    case "database":
      throw new Error("Die Datenbank-Quelle kommt erst in Phase 3.");
    case "mock":
    default:
      return new MockDataSource();
  }
}
