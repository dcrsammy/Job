// One-off: ingest every enabled source now (normally the background worker does this).
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/load-jobs.mts
import { createClient } from "@supabase/supabase-js";
import { ingestSource, type SourceRow } from "../src/lib/services/ingest";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: sources, error } = await db.from("job_sources").select("*").eq("enabled", true).order("name");
if (error) throw error;
let total = 0;
for (const s of sources as SourceRow[]) {
  const r = await ingestSource(db, s);
  total += r.inserted;
  console.log(`${r.status.padEnd(7)} ${s.name.padEnd(22)} fetched ${r.fetched}, new ${r.inserted}${r.errors[0] ? "  ! " + r.errors[0].slice(0, 80) : ""}`);
}
const { count } = await db.from("jobs").select("id", { count: "exact", head: true }).eq("is_active", true).is("duplicate_of", null);
console.log(`\nDone: ${total} new listings, ${count} live jobs in the database.`);
