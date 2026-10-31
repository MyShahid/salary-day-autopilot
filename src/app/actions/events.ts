"use server";

import { revalidatePath } from "next/cache";
import { addEvent, deleteEvent, getDecisionSentences } from "@/lib/plan-service";

/** `details`: the plan's decision sentences that are new because of this entry. */
export type LogEventState = { error: string } | { savedAt: number; details: string[] } | undefined;
export type UndoState = { error: string } | { savedAt: number } | undefined;

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export async function logEventAction(_prev: LogEventState, formData: FormData): Promise<LogEventState> {
  const before = new Set(await getDecisionSentences());
  const result = await addEvent(
    field(formData, "type"),
    field(formData, "amount"),
    field(formData, "date"),
    field(formData, "name"),
    field(formData, "note"),
  );
  if (!result.ok) return { error: result.error };
  // The engine's own sentences that this entry added or changed; no new maths here.
  const details = (await getDecisionSentences()).filter((s) => !before.has(s));
  revalidatePath("/");
  return { savedAt: Date.now(), details };
}

export async function undoEventAction(_prev: UndoState, formData: FormData): Promise<UndoState> {
  const result = await deleteEvent(field(formData, "id"));
  if (!result.ok) return { error: result.error };
  revalidatePath("/");
  return { savedAt: Date.now() };
}
