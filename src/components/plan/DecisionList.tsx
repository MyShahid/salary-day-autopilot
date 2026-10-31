"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { DecisionKind } from "@/lib/engine/types";
import { BoldRupees } from "./BoldRupees";

export interface DecisionRow {
  kind: DecisionKind;
  sentence: string;
}

// ✓ money counted or set aside · ✂ money cut or taken for an expense · ⚠ missing or not counted
const ICON: Record<DecisionKind, { icon: string; label: string; className: string }> = {
  count_income: { icon: "✓", label: "Counted", className: "bg-emerald-100 text-emerald-800" },
  reserve: { icon: "✓", label: "Set aside", className: "bg-emerald-100 text-emerald-800" },
  already_paid: { icon: "✓", label: "Already paid", className: "bg-emerald-100 text-emerald-800" },
  cut: { icon: "✂", label: "Cut", className: "bg-amber-100 text-amber-900" },
  cover_expense: { icon: "✂", label: "Taken for an expense", className: "bg-amber-100 text-amber-900" },
  skip_income: { icon: "⚠", label: "Not counted", className: "bg-slate-200 text-slate-800" },
  shortfall: { icon: "⚠", label: "Warning", className: "bg-red-100 text-red-800" },
};

// ---- "What just changed" highlight, set by the log form after a save ----------------------

const HIGHLIGHT_MS = 4000;
const HighlightCtx = createContext<{ highlight: string[]; show: (sentences: string[]) => void } | null>(null);

export function DecisionHighlightProvider({ children }: { children: React.ReactNode }) {
  const [highlight, setHighlight] = useState<string[]>([]);
  useEffect(() => {
    if (highlight.length === 0) return;
    const timer = setTimeout(() => setHighlight([]), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlight]);
  return <HighlightCtx.Provider value={{ highlight, show: setHighlight }}>{children}</HighlightCtx.Provider>;
}

/** Call with the sentences an action just changed; they jump to the top and glow for a few seconds. */
export const useShowDecisions = () => useContext(HighlightCtx)?.show ?? (() => {});

/**
 * One row per decision with a small icon and bold ₹ amounts. `newestFirst` lists
 * the engine's steps in reverse. Highlighted sentences go to the top.
 */
export function DecisionList({ decisions, newestFirst = false }: { decisions: DecisionRow[]; newestFirst?: boolean }) {
  const highlight = useContext(HighlightCtx)?.highlight ?? [];
  const ordered = newestFirst ? [...decisions].reverse() : decisions;
  const lit = new Set(highlight);
  const rows = [...ordered.filter((d) => lit.has(d.sentence)), ...ordered.filter((d) => !lit.has(d.sentence))];

  return (
    <ol className="divide-y divide-slate-100">
      {rows.map((d, i) => {
        const icon = ICON[d.kind];
        return (
          <li
            key={`${i}-${d.sentence}`}
            className={`flex gap-3 px-4 py-3 text-sm leading-relaxed text-slate-700 transition-colors duration-700 ${
              lit.has(d.sentence) ? "bg-yellow-100" : ""
            }`}
          >
            <span
              aria-label={icon.label}
              title={icon.label}
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${icon.className}`}
            >
              {icon.icon}
            </span>
            <span className="min-w-0 break-words">
              <BoldRupees text={d.sentence} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Collapsed by default; opens by itself when a new entry highlights something inside. */
export function DecisionDisclosure({
  title,
  decisions,
  newestFirst = false,
}: {
  title: string;
  decisions: DecisionRow[];
  newestFirst?: boolean;
}) {
  const highlight = useContext(HighlightCtx)?.highlight ?? [];
  const [open, setOpen] = useState(false);
  const hasNew = highlight.some((s) => decisions.some((d) => d.sentence === s));
  useEffect(() => {
    if (hasNew) setOpen(true);
  }, [hasNew]);

  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="rounded-xl bg-white shadow-sm">
      <summary className="cursor-pointer p-4 text-sm font-semibold">
        {title} ({decisions.length})
      </summary>
      <div className="border-t border-slate-100">
        <DecisionList decisions={decisions} newestFirst={newestFirst} />
      </div>
    </details>
  );
}
