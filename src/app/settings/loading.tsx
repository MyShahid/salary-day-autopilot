export default function SettingsLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading your details">
      <div className="h-8 w-40 animate-pulse rounded bg-slate-200" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-32 animate-pulse rounded-xl bg-white" />
        </div>
      ))}
      <p className="sr-only">Loading…</p>
    </div>
  );
}
