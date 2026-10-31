"use client";

import { useActionState } from "react";
import { undoEventAction, type UndoState } from "@/app/actions/events";

export function UndoButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<UndoState, FormData>(undoEventAction, undefined);
  return (
    <form action={formAction} className="shrink-0 text-right">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Undoing…" : "Undo"}
      </button>
      {state?.error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
