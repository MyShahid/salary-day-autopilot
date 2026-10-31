"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { logEventAction, type LogEventState } from "@/app/actions/events";
import type { EventType } from "@/lib/engine/types";
import { EVENT_LABELS, EVENT_TYPES, OTHER_INCOME } from "@/lib/events";

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
  const formRef = useRef<HTMLFormElement>(null);

  const savedAt = state && "savedAt" in state ? state.savedAt : undefined;
  useEffect(() => {
    if (savedAt === undefined) return;
    formRef.current?.reset();
    setOpen(false);
  }, [savedAt]);

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white"
        >
          Log something
        </button>
        {savedAt !== undefined && <p className="text-sm text-emerald-700">Saved. Your plan is updated.</p>}
      </div>
    );
  }

  const noBills = type === "bill_paid" && billNames.length === 0;
  const showNote = type !== "bill_paid" && !(type === "income_received" && incomeChoice !== OTHER_INCOME);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4 rounded-xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Log something</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-600 underline">
          Cancel
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
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">You haven't added any bills yet.</p>
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
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || noBills}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
