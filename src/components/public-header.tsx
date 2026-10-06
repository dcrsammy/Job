import Link from "next/link";
import { Logo } from "./logo";

export function PublicHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6">
      <Logo />
      <nav aria-label="Account" className="flex items-center gap-2">
        <Link href="/pricing" className="inline-flex h-10 items-center rounded-md px-3 text-[14px] font-semibold text-ink-2 hover:text-ink">Pricing</Link>
        {signedIn ? (
          <Link href="/dashboard" className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-[14px] font-semibold text-paper hover:bg-ink-2">Open dashboard</Link>
        ) : (
          <>
            <Link href="/login" className="inline-flex h-10 items-center rounded-md px-3 text-[14px] font-semibold text-ink-2 hover:text-ink">Sign in</Link>
            <Link href="/signup" className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-[14px] font-semibold text-paper hover:bg-ink-2">Get started</Link>
          </>
        )}
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-3 px-4 py-8 text-[14px] text-ink-3 sm:flex-row sm:justify-between sm:px-6">
        <p>We help you find and prepare. You decide where to apply. We never guarantee a job.</p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/pricing" className="hover:text-ink">Pricing</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
