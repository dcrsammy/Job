import { AdminTabs } from "@/components/admin-forms";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-[28px] font-bold tracking-[-0.01em]">Admin</h1>
        <span className="text-[13px] text-ink-3">Everything here is live data. Every change you make is logged.</span>
      </div>
      <AdminTabs />
      {children}
    </>
  );
}
