// Central access to environment variables. Server-only values must never be
// imported into client components.

export function publicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  };
}

export function isSupabaseConfigured(): boolean {
  const e = publicEnv();
  return !!e.supabaseUrl && !!e.supabaseAnonKey;
}

export function serverEnv() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return {
    ...publicEnv(),
    serviceRoleKey,
    cronSecret: process.env.CRON_SECRET ?? "",
  };
}
