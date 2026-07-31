import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

// Browser-side client. Runs as the `anon` role, which RLS currently denies on
// every table — the app reads and writes through the API routes instead.
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
