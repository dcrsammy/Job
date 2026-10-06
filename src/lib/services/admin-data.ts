// Read helpers for the admin console (service-role client only).
import type { SupabaseClient } from "@supabase/supabase-js";

/** id → email for a set of user ids. */
export async function emailsFor(db: SupabaseClient, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
  const out = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await db.from("profiles").select("id, email").in("id", unique.slice(i, i + 200));
    for (const r of data ?? []) out.set(r.id, r.email ?? r.id);
  }
  return out;
}

export interface AuthInfo {
  lastSignIn: string | null;
  confirmed: boolean;
  bannedUntil: string | null;
  provider: string | null;
}

/** Sign-in details from Supabase Auth, for up to the first few thousand users. */
export async function authInfo(db: SupabaseClient, ids?: string[]): Promise<Map<string, AuthInfo>> {
  const out = new Map<string, AuthInfo>();
  const want = ids ? new Set(ids) : null;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (want && !want.has(u.id)) continue;
      const banned = (u as { banned_until?: string | null }).banned_until ?? null;
      out.set(u.id, {
        lastSignIn: u.last_sign_in_at ?? null,
        confirmed: !!(u.email_confirmed_at ?? u.confirmed_at),
        bannedUntil: banned && new Date(banned) > new Date() ? banned : null,
        provider: (u.app_metadata?.provider as string) ?? null,
      });
    }
    if (want && out.size >= want.size) break;
    if (data.users.length < 1000) break;
  }
  return out;
}

export const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
