// Background worker run by GitHub Actions: schedules due job sources, then
// works through the queue (ingestion, match refresh, retention purge).
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";
import { processTasks, scheduleDueWork } from "../src/lib/services/worker";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const deadline = Date.now() + 12 * 60_000;
console.log(`scheduled ${await scheduleDueWork(db)} source(s)`);
while (Date.now() < deadline) {
  const done = await processTasks(db, 5, 120_000);
  for (const t of done) console.log(`${t.ok ? "ok  " : "FAIL"} ${t.kind} ${t.detail ?? ""}`);
  if (done.length === 0) break;
}
