// Server-rendered building blocks for the admin console.
import Link from "next/link";
import type { ReactNode } from "react";
import { cx, Tag } from "./ui";
import { planInfo, type PlanTier } from "@/lib/config";

export function Stats({ items }: { items: { n: ReactNode; l: string; href?: string; tone?: "warn" | "bad" }[] }) {
  return (
    <section className="mb-8 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
      {items.map((s) => {
        const body = (
          <>
            <span className={cx("block text-[26px] leading-none font-bold num", s.tone === "bad" && "text-block", s.tone === "warn" && "text-possible")}>{s.n}</span>
            <span className="mt-1.5 block text-[13.5px] text-ink-2">{s.l}</span>
          </>
        );
        return s.href ? (
          <Link key={s.l} href={s.href} className="bg-surface px-5 py-4 hover:bg-sunken">
            {body}
          </Link>
        ) : (
          <div key={s.l} className="bg-surface px-5 py-4">
            {body}
          </div>
        );
      })}
    </section>
  );
}

export function Table({ head, children, min = 760 }: { head: ReactNode[]; children: ReactNode; min?: number }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
      <table className="w-full text-[13.5px]" style={{ minWidth: min }}>
        <thead className="border-b border-line text-left text-ink-2">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3.5 py-2.5 font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("px-3.5 py-2.5 align-top", className)}>{children}</td>;
}

export function PlanTag({ plan }: { plan: string | null | undefined }) {
  const p = (plan ?? "free") as PlanTier;
  return <Tag tone={p === "premium" ? "tape" : p === "pro" ? "strong" : "neutral"}>{planInfo[p]?.name ?? p}</Tag>;
}

export function UserLink({ id, email }: { id: string | null | undefined; email?: string | null }) {
  if (!id) return <span className="text-ink-3">system</span>;
  return (
    <Link href={`/admin/users/${id}`} className="underline-offset-2 hover:underline">
      {email ?? id.slice(0, 8)}
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-[10px] border border-dashed border-line-strong px-4 py-6 text-center text-ink-2">{children}</p>;
}

export function Pager({ page, hasMore, base }: { page: number; hasMore: boolean; base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="mt-4 flex items-center gap-3 text-[14px]">
      {page > 1 ? <Link className="underline underline-offset-2" href={`${base}${sep}page=${page - 1}`}>Newer</Link> : null}
      <span className="text-ink-3">Page {page}</span>
      {hasMore ? <Link className="underline underline-offset-2" href={`${base}${sep}page=${page + 1}`}>Older</Link> : null}
    </div>
  );
}

/** Human labels for audit actions; unknown actions show as-is. */
export const ACTION_LABEL: Record<string, string> = {
  "account.created": "Signed up",
  "account.deleted": "Account deleted",
  "resume.uploaded": "Uploaded a resume",
  "resume.parsed": "Resume parsed",
  "resume.deleted": "Deleted a resume",
  "resume.retention_purged": "Resume purged (retention)",
  "profile.confirmed": "Confirmed profile",
  "job.saved": "Saved a job",
  "application.generated": "Prepared an application",
  "application.reviewed": "Finished checklist",
  "application.applied": "Marked as applied",
  "application.status": "Changed application status",
  "application.employer_questions": "Answered employer questions",
  "application.no_response": "Auto: no response",
  "application.listing_closed": "Auto: listing closed",
  "premium.interview_prep": "Interview prep",
  "premium.follow_up": "Follow-up email",
  "plan.requested": "Requested a plan",
  "plan.changed": "Plan changed",
  "plan.downgraded": "Switched to Basic",
  "plan.request_declined": "Plan request declined",
  "plan.request_cancelled": "Cancelled plan request",
  "plan.credits_set": "Credits set",
  "ai.error": "AI error",
  "data.exported": "Exported data",
  "data.resume_data_deleted": "Deleted resume data",
  "privacy.retention_changed": "Changed retention",
};
