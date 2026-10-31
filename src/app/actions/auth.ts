"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";
import { buildSampleData } from "@/lib/sample-data";
import { firstErrorMessage, loginSchema, signupSchema } from "@/lib/validation";

export type AuthFormState = { error: string; email: string } | undefined;

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!parsed.success) {
    return { error: firstErrorMessage(parsed.error), email: field(formData, "email") ?? "" };
  }
  const { email, password } = parsed.data;

  try {
    const passwordHash = await hashPassword(password);
    // Nested create runs in one transaction: the user and all sample data, or nothing.
    const user = await prisma.user.create({
      data: { email, passwordHash, ...buildSampleData(new Date()) },
      select: { id: true },
    });
    await createSession(user.id);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "An account with this email already exists. Try logging in instead.", email };
    }
    console.error("signup failed", err);
    return { error: "Something went wrong creating your account. Please try again.", email };
  }

  // redirect() throws, so it must stay outside the try block.
  // New users start on My details to replace the sample numbers with their own.
  redirect("/settings?welcome=1");
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
  });
  if (!parsed.success) {
    return { error: firstErrorMessage(parsed.error), email: field(formData, "email") ?? "" };
  }
  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    const ok = await verifyPassword(password, user?.passwordHash);
    if (!user || !ok) {
      return { error: "Email or password is incorrect.", email };
    }
    await createSession(user.id);
  } catch (err) {
    console.error("login failed", err);
    return { error: "Something went wrong logging you in. Please try again.", email };
  }

  redirect("/");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}
