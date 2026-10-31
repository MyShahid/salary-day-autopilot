"use client";

import { useActionState, useState } from "react";
import { undoEventAction, type UndoState } from "@/app/actions/events";
import { useResultToast } from "@/components/toast/ToastProvider";

export interface EntryRow {
  id: string;
  title: string;
  note: string | null;
  detail: string; // "₹12,000 · Sat, 31 Oct"
}

/**
 * The recent entries list owns the Undo action, so its toast still shows after
 * the undone row disappears.
 */
export function RecentEntries({ rows }: { rows: EntryRow[] }) {
  const [state, formAction, pending] = useActionState<UndoState, FormData>(undoEventAction, undefined);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  useResultToast(state, "Undone. Your home screen is updated.");

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm">
        Nothing logged yet. Use “Log something” when money comes in or goes out.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-xl bg-white shadow-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0 text-sm">
            <p className="font-medium break-words">
              {r.title}
              {r.note ? <span className="font-normal text-slate-600"> · {r.note}</span> : null}
            </p>
            <p className="text-slate-600">{r.detail}</p>
          </div>
          <form action={formAction} onSubmit={() => setUndoingId(r.id)} className="shrink-0">
            <input type="hidden" name="id" value={r.id} />
            <button
              type="submit"
              disabled={pending}
              className="min-w-[5.5rem] rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {pending && undoingId === r.id ? "Undoing…" : "Undo"}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
