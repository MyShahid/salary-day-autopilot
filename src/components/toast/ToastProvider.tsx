"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BoldRupees } from "@/components/plan/BoldRupees";

type Kind = "success" | "error";
interface Toast {
  id: number;
  kind: Kind;
  message: string;
  /** Extra lines under the message, e.g. the plan's decisions for a new entry. */
  details?: string[];
}

const AUTO_CLOSE_MS = 5000;
type Notify = (message: string, kind?: Kind, details?: string[]) => void;
const ToastContext = createContext<Notify>(() => {});

/** Shows a toast. Success toasts close after 5 seconds; errors stay until closed. */
export const useToast = () => useContext(ToastContext);

/**
 * Toasts each time a server action returns: `successMessage` on { savedAt }, the
 * error text on { error }. Every return is a new object, so repeats toast too.
 * Call it in a component that stays on screen after the action (not in a row the
 * action removes), or the toast never fires.
 */
export function useResultToast(
  state: { error: string } | { savedAt: number; details?: string[] } | undefined,
  successMessage: string,
) {
  const notify = useToast();
  useEffect(() => {
    if (!state) return;
    if ("error" in state) notify(state.error, "error");
    else notify(successMessage, "success", state.details);
  }, [state, notify, successMessage]);
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: number) => void }) {
  // onClose is stable, so a new toast arriving doesn't restart this one's timer.
  useEffect(() => {
    if (toast.kind !== "success") return;
    const timer = setTimeout(() => onClose(toast.id), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [toast.id, toast.kind, onClose]);

  const success = toast.kind === "success";
  return (
    <div
      role={success ? "status" : "alert"}
      className={`pointer-events-auto relative overflow-hidden rounded-xl border shadow-lg ${
        success ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-red-300 bg-red-50 text-red-950"
      }`}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 text-sm break-words">
          <p className="font-medium">{toast.message}</p>
          {toast.details && toast.details.length > 0 && (
            <ul className="mt-1 space-y-1">
              {toast.details.slice(0, 4).map((d) => (
                <li key={d}>
                  <BoldRupees text={d} />
                </li>
              ))}
              {toast.details.length > 4 && <li>…and {toast.details.length - 4} more under "How I planned your money".</li>}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => onClose(toast.id)}
          aria-label="Close"
          className="-m-1 shrink-0 rounded-md p-1 text-lg leading-none opacity-70 hover:opacity-100"
        >
          ✕
        </button>
      </div>
      {success && (
        <div
          aria-hidden
          className="toast-timer absolute bottom-0 left-0 h-1 w-full origin-left bg-emerald-600"
          style={{ animationDuration: `${AUTO_CLOSE_MS}ms` }}
        />
      )}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const notify = useCallback<Notify>((message, kind = "success", details) => {
    const id = nextId.current++;
    // Keep at most three on screen.
    setToasts((list) => [...list.slice(-2), { id, kind, message, details }]);
  }, []);
  const close = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {/* Fixed position, so toasts never push the page around. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={close} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
