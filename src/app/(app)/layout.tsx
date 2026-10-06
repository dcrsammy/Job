import { signOut } from "@/app/actions/auth";
import { MobileNav, NavLinks } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { effectivePlan, planInfo } from "@/lib/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user.id).single(),
    supabase.from("subscriptions").select("plan, status, current_period_end, requested_plan").eq("user_id", user.id).maybeSingle(),
  ]);
  const plan = effectivePlan(sub);
  const isAdmin = profile?.role === "admin";
  const name = profile?.full_name || user.email;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-line lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:px-4 lg:py-6">
        <div className="mb-8 px-2">
          <Logo href="/dashboard" />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto">
          <NavLinks isAdmin={isAdmin} />
        </nav>
        <div className="mt-4 border-t border-line px-2 pt-4">
          <p className="truncate text-[13.5px] font-semibold" title={name ?? ""}>{name}</p>
          <p className="text-[13px] text-ink-3">
            {planInfo[plan].name} plan
            {plan !== "premium" ? (
              <>
                {" · "}
                <Link href="/settings#plan" className="underline underline-offset-2 hover:text-ink">{sub?.requested_plan ? "Upgrade requested" : "Upgrade"}</Link>
              </>
            ) : null}
          </p>
          <form action={signOut}>
            <button className="mt-1 text-[13.5px] text-ink-3 underline-offset-2 hover:text-ink hover:underline">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="relative flex h-16 items-center justify-between border-b border-line px-4 lg:hidden">
          <Logo href="/dashboard" />
          <MobileNav isAdmin={isAdmin} />
        </header>
        <main className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
