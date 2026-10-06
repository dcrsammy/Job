import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[60ch] px-4 py-24">
      <h1 className="text-[30px] font-bold">Page not found</h1>
      <p className="mt-2 text-ink-2">The page may have moved, or the job listing may have closed.</p>
      <Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-md bg-ink px-4 font-semibold text-paper">Go to your dashboard</Link>
    </main>
  );
}
