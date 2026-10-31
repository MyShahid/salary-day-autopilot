"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions/settings";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** A form bound to a server action, with a plain-English error line and a "Saved" note. */
export function ActionForm({
  action,
  submitLabel = "Save",
  resetOnSave = false,
  children,
}: {
  action: Action;
  submitLabel?: string;
  resetOnSave?: boolean;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const savedAt = state && "savedAt" in state ? state.savedAt : undefined;

  useEffect(() => {
    if (savedAt !== undefined && resetOnSave) formRef.current?.reset();
  }, [savedAt, resetOnSave]);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-3">
      {children}
      {state && "error" in state && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {savedAt !== undefined && !pending && <span className="text-sm text-emerald-700">Saved ✓</span>}
      </div>
    </form>
  );
}
