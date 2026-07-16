import { createClient } from "@supabase/supabase-js";

/**
 * The shared Supabase client. Reads the project URL + publishable/anon key from
 * Vite env (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). These are safe to
 * expose in the browser — Row-Level Security protects the data.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Surfaced early so a missing .env is obvious rather than a cryptic runtime error.
  console.error(
    "Supabase env vars missing: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env"
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const supabaseConfigured = Boolean(url && anonKey);
