import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { textToDocx } from "@/lib/export-docx";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const doc = request.nextUrl.searchParams.get("doc") === "cover" ? "cover" : "resume";
  const format = request.nextUrl.searchParams.get("format") === "txt" ? "txt" : "docx";
  const { data: app } = await supabase
    .from("tailored_applications")
    .select("id, resume_text, jobs(title, employer_name), cover_letters(content)")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cover = app.cover_letters as unknown as { content: string } | { content: string }[] | null;
  const text = doc === "resume" ? app.resume_text ?? "" : Array.isArray(cover) ? cover[0]?.content ?? "" : cover?.content ?? "";
  const job = app.jobs as unknown as { title: string; employer_name: string } | null;
  const base = `${doc === "resume" ? "Resume" : "Cover letter"} - ${job?.employer_name ?? "application"}`.replace(/[^\w\s-]/g, "").slice(0, 80);

  await supabase.from("tailored_applications").update({ status: "exported" }).eq("id", id).eq("user_id", user.id).eq("status", "reviewed");

  if (format === "txt") {
    return new NextResponse(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.txt"` } });
  }
  const bytes = await textToDocx(text, { kind: doc === "resume" ? "resume" : "letter" });
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${base}.docx"`,
    },
  });
}
