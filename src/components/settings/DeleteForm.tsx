"use client";

import { createContext, useActionState, useContext, useState } from "react";
import { deleteItemAction, type FormState } from "@/app/actions/settings";
import { useResultToast } from "@/components/toast/ToastProvider";

interface DeleteContext {
  formAction: (formData: FormData) => void;
  pending: boolean;
  deletingId: string | null;
  setDeletingId: (id: string) => void;
}

const Ctx = createContext<DeleteContext | null>(null);

/**
 * Owns the delete action for the whole page. A deleted item's form disappears,
 * so the toast has to come from something that stays on screen.
 */
export function DeleteProvider({ children }: { children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(deleteItemAction, undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  useResultToast(state, "Deleted. Your home screen is updated.");
  return <Ctx.Provider value={{ formAction, pending, deletingId, setDeletingId }}>{children}</Ctx.Provider>;
}

export function DeleteForm({ kind, id, name }: { kind: "bill" | "income" | "goal"; id: string; name: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("DeleteForm must be inside DeleteProvider");
  const busy = ctx.pending && ctx.deletingId === id;
  return (
    <form
      action={ctx.formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Are you sure you want to delete "${name}"?`)) e.preventDefault();
        else ctx.setDeletingId(id);
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={ctx.pending}
        className="min-w-[6rem] rounded-lg border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-60"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
    </form>
  );
}
