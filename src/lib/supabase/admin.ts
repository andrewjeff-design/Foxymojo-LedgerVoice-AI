import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseEnv, requireEnv } from "@/lib/env";

export function createAdminSupabaseClient() {
  const { url } = publicSupabaseEnv();
  return createClient(url, requireEnv("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
