"use client";

import { Children, useState } from "react";

/** Shows the first `initial` children, then a "Show N more ▼" / "Show less ▲" toggle. */
export function ShowMore({ initial = 4, children }: { initial?: number; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const hidden = items.length - initial;
  return (
    <>
      {expanded ? items : items.slice(0, initial)}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
        >
          {expanded ? "Show less ▲" : `Show ${hidden} more ▼`}
        </button>
      )}
    </>
  );
}
