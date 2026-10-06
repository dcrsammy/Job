"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-[60ch] py-16">
      <h1 className="text-[26px] font-bold">Something went wrong loading this page</h1>
      <p className="mt-2 text-ink-2">Try again. If it keeps happening, the error reference is {error.digest ?? "not available"}.</p>
      <button onClick={reset} className="mt-6 inline-flex h-10 items-center rounded-md bg-ink px-4 font-semibold text-paper">Try again</button>
    </div>
  );
}
