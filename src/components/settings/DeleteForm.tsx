"use client";

import { useActionState } from "react";
import { deleteItemAction, type FormState } from "@/app/actions/settings";

export function DeleteForm({ kind, id, name }: { kind: "bill" | "income" | "goal"; id: string; name: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(deleteItemAction, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Are you sure you want to delete "${name}"?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state && "error" in state && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
