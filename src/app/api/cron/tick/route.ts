import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processTasks, scheduleDueWork } from "@/lib/services/worker";

// Called every few minutes by a scheduler (GitHub Actions or a Cloudflare cron
// worker) with "Authorization: Bearer $CRON_SECRET". Schedules due job sources
// and works through the queue within a time budget.
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 3, 10);
  const scheduled = await scheduleDueWork(db);
  const processed = await processTasks(db, limit);
  return NextResponse.json({ scheduled, processed });
}

export const GET = handle;
export const POST = handle;
