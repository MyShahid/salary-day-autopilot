"use server";

import { revalidatePath } from "next/cache";
import type { ServiceResult } from "@/lib/service-result";
import {
  createBill,
  createGoal,
  createIncome,
  deleteBill,
  deleteGoal,
  deleteIncome,
  updateBalance,
  updateBill,
  updateGoal,
  updateIncome,
  updateName,
  updateNextSalary,
  updateProfile,
} from "@/lib/settings-service";

export type FormState = { error: string } | { savedAt: number } | undefined;

/** Form fields as a plain object of strings (checkboxes are absent when unticked). */
function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") out[key] = value;
  return out;
}

function done<T>(result: ServiceResult<T>): FormState {
  if (!result.ok) return { error: result.error };
  // The home screen is built from these values, so refresh it too.
  revalidatePath("/");
  revalidatePath("/settings");
  return { savedAt: Date.now() };
}

export async function saveProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return done(await updateProfile(fields(formData)));
}

export async function saveNameAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return done(await updateName(fields(formData)));
}

export async function saveNextSalaryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return done(await updateNextSalary(fields(formData)));
}

export async function saveBalanceAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return done(await updateBalance(fields(formData)));
}

export async function saveBillAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id, ...data } = fields(formData);
  return done(id ? await updateBill(id, data) : await createBill(data));
}

export async function saveIncomeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id, ...data } = fields(formData);
  return done(id ? await updateIncome(id, data) : await createIncome(data));
}

export async function saveGoalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { id, ...data } = fields(formData);
  return done(id ? await updateGoal(id, data) : await createGoal(data));
}

export async function deleteItemAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { kind, id } = fields(formData);
  if (kind === "bill") return done(await deleteBill(id));
  if (kind === "income") return done(await deleteIncome(id));
  if (kind === "goal") return done(await deleteGoal(id));
  return { error: "We couldn't find that." };
}
