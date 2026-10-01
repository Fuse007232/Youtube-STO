import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase-Zugang NUR für den Server (geheimer Schlüssel, umgeht RLS).
 * Niemals in Client-Komponenten importieren – "server-only" verhindert das.
 */
let client: SupabaseClient | null = null;

export function isSupabaseConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SECRET_KEY);
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase ist nicht eingerichtet: SUPABASE_URL und SUPABASE_SECRET_KEY fehlen (Vercel → Settings → Environment Variables).",
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
