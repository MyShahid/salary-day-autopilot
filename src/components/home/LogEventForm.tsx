"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { logEventAction, type LogEventState } from "@/app/actions/events";
import type { EventType } from "@/lib/engine/types";
import { EVENT_LABELS, EVENT_TYPES, OTHER_INCOME } from "@/lib/events";
import { useResultToast } from "@/components/toast/ToastProvider";
import { useShowDecisions } from "@/components/plan/DecisionList";

const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base";

export function LogEventForm({
  today,
  billNames,
  incomeNames,
}: {
  today: string;
  billNames: string[];
  incomeNames: string[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<EventType>("expense");
  const [incomeChoice, setIncomeChoice] = useState(incomeNames[0] ?? OTHER_INCOME);
  const [state, formAction, pending] = useActionState<LogEventState, FormData>(logEventAction, undefined);
  useResultToast(state, "Logged. Your home screen is updated.");
  const formRef = useRef<HTMLFormElement>(null);

  const showDecisions = useShowDecisions();
  const saved = state && "savedAt" in state ? state : undefined;
  useEffect(() => {
    if (!saved) return;
    formRef.current?.reset();
    setOpen(false);
    showDecisions(saved.details);
  }, [saved, showDecisions]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const noBills = type === "bill_paid" && billNames.length === 0;
  const showNote = type !== "bill_paid" && !(type === "income_received" && incomeChoice !== OTHER_INCOME);

  return (
    <>
      {/* Phone: pinned to the bottom of the screen. Wider screens: sits in the page. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mx-auto block w-full max-w-xl rounded-xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white shadow-sm"
        >
          + Log something
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <form
            ref={formRef}
            action={formAction}
            noValidate
            role="dialog"
            aria-modal="true"
            aria-label="Log something"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Log something</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-2 text-lg leading-none">
                ✕
              </button>
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-medium">What happened?</span>
              <select name="type" value={type} onChange={(e) => setType(e.target.value as EventType)} className={input}>
                {EVENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EVENT_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            {type === "bill_paid" &&
              (noBills ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  You haven't added any bills yet. Add them in My details.
                </p>
              ) : (
                <label className="block space-y-1">
                  <span className="text-sm font-medium">Which bill?</span>
                  <select name="name" className={input} defaultValue={billNames[0]}>
                    {billNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

            {type === "income_received" && (
              <label className="block space-y-1">
                <span className="text-sm font-medium">From where?</span>
                <select name="name" value={incomeChoice} onChange={(e) => setIncomeChoice(e.target.value)} className={input}>
                  {incomeNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value={OTHER_INCOME}>Other (bonus etc.)</option>
                </select>
              </label>
            )}

            <label className="block space-y-1">
              <span className="text-sm font-medium">Amount (₹)</span>
              <input name="amount" type="text" inputMode="numeric" autoComplete="off" placeholder="12000" className={input} />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Date</span>
              <input name="date" type="date" defaultValue={today} max={today} className={input} />
            </label>

            {showNote && (
              <label className="block space-y-1">
                <span className="text-sm font-medium">Note (optional)</span>
                <input
                  name="note"
                  type="text"
                  maxLength={200}
                  placeholder={type === "income_received" ? "Diwali bonus" : "Hospital, auto fare…"}
                  className={input}
                />
              </label>
            )}

            {state && "error" in state && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending || noBills}
              className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
