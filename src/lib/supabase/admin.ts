import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { SUPABASE_URL } from "./env";

let client: SupabaseClient<Database> | null = null;

// Service-role client for Route Handlers that write on behalf of nobody
// (the voice webhooks, lead ingestion, the dashboard's own mutations).
// Bypasses RLS — never import this from a Client Component.
export function adminClient(): SupabaseClient<Database> {
  if (client) return client;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill it in."
    );
  }

  client = createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
