"use server";

import { revalidatePath } from "next/cache";
import { addEvent, deleteEvent } from "@/lib/plan-service";

export type LogEventState = { error: string } | { savedAt: number } | undefined;
export type UndoState = { error: string } | undefined;

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export async function logEventAction(_prev: LogEventState, formData: FormData): Promise<LogEventState> {
  const result = await addEvent(
    field(formData, "type"),
    field(formData, "amount"),
    field(formData, "date"),
    field(formData, "name"),
    field(formData, "note"),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/");
  return { savedAt: Date.now() };
}

export async function undoEventAction(_prev: UndoState, formData: FormData): Promise<UndoState> {
  const result = await deleteEvent(field(formData, "id"));
  if (!result.ok) return { error: result.error };
  revalidatePath("/");
  return undefined;
}
