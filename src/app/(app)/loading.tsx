export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse">
      <span className="sr-only">Loading</span>
      <div className="mb-3 h-8 w-64 rounded bg-sunken" />
      <div className="mb-8 h-4 w-96 max-w-full rounded bg-sunken" />
      <div className="h-40 rounded-[10px] bg-sunken" />
    </div>
  );
}
