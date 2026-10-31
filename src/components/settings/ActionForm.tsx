"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions/settings";
import { useResultToast } from "@/components/toast/ToastProvider";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * A form bound to a server action: toast on every result, "Saved ✓" after a
 * save, and the button disabled while saving so a double tap can't save twice.
 *
 * `version` should change whenever the saved values change. The fields are keyed
 * on it, so after a save they show exactly what was stored (React resets a form
 * after its action; without the key it could briefly show the old values).
 */
export function ActionForm({
  action,
  submitLabel = "Save",
  successMessage = "Saved. Your home screen is updated.",
  savedNote,
  resetOnSave = false,
  version,
  children,
}: {
  action: Action;
  submitLabel?: string;
  successMessage?: string;
  /** Extra words after "Saved ✓", e.g. "as of Sat, 31 Oct". */
  savedNote?: string;
  resetOnSave?: boolean;
  version?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, undefined);
  useResultToast(state, successMessage);
  const formRef = useRef<HTMLFormElement>(null);
  const savedAt = state && "savedAt" in state ? state.savedAt : undefined;

  useEffect(() => {
    if (savedAt !== undefined && resetOnSave) formRef.current?.reset();
  }, [savedAt, resetOnSave]);

  return (
    <form ref={formRef} action={formAction} noValidate aria-busy={pending} className="space-y-3">
      <div key={version} className="space-y-3">
        {children}
      </div>
      {state && "error" in state && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      )}
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="submit"
          disabled={pending}
          className="min-w-[7rem] rounded-lg bg-slate-900 px-4 py-2.5 font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {savedAt !== undefined && !pending && !resetOnSave && (
          <span className="text-sm font-medium text-emerald-700">
            Saved ✓{savedNote ? ` · ${savedNote}` : ""}
          </span>
        )}
      </div>
    </form>
  );
}
