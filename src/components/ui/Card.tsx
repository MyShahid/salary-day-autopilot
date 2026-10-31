/** A white card with a small heading, used for each block on the home screen. */
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className="px-1 text-sm font-semibold tracking-wide text-slate-600 uppercase">{title}</h2>
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">{children}</div>
    </section>
  );
}
