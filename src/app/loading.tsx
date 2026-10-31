// Shown while the home screen's numbers load. Blocks match the real cards' sizes
// so nothing jumps when the content arrives.
export default function HomeLoading() {
  return (
    <div className="space-y-5 pb-24 sm:pb-0" aria-busy="true" aria-label="Loading your plan">
      <div className="h-[15.5rem] animate-pulse rounded-2xl bg-slate-300" />
      <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
      <div className="space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-48 animate-pulse rounded-xl bg-white" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
        <div className="h-20 animate-pulse rounded-xl bg-white" />
      </div>
      <p className="sr-only">Loading…</p>
    </div>
  );
}
