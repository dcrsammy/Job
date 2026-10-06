import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "../env";

let cached: SupabaseClient | null = null;

/**
 * Service-role client: bypasses RLS. Use only in server code for system work
 * (ingestion, matching, usage records) and always scope queries by user id.
 */
export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const { supabaseUrl, serviceRoleKey } = serverEnv();
  cached = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}
