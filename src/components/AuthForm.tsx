"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup, type AuthFormState } from "@/app/actions/auth";

const copy = {
  login: {
    title: "Log in",
    submit: "Log in",
    pending: "Logging in…",
    passwordAutoComplete: "current-password",
    switchText: "New here?",
    switchLink: "Create an account",
    switchHref: "/signup",
  },
  signup: {
    title: "Create your account",
    submit: "Sign up",
    pending: "Creating account…",
    passwordAutoComplete: "new-password",
    switchText: "Already have an account?",
    switchLink: "Log in",
    switchHref: "/login",
  },
} as const;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    mode === "login" ? login : signup,
    undefined,
  );
  const text = copy[mode];

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-8 sm:pt-16">
      <div className="text-center">
        <p className="text-2xl font-extrabold tracking-tight">Salary Day Autopilot</p>
        <p className="mt-1 text-base text-slate-600">Know what's safe to spend until your next salary.</p>
      </div>

      {/* noValidate: the server's plain-English messages are the single source of validation errors. */}
      <form action={formAction} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm" noValidate>
        <h1 className="text-xl font-bold">{text.title}</h1>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            defaultValue={state?.email}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Password</span>
          <input
            name="password"
            type="password"
            autoComplete={text.passwordAutoComplete}
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
          />
          {mode === "signup" && <span className="text-xs text-slate-500">At least 8 characters.</span>}
        </label>

        {state?.error && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {pending ? text.pending : text.submit}
        </button>
      </form>

      <p className="text-center text-sm text-slate-600">
        {text.switchText}{" "}
        <Link href={text.switchHref} className="font-medium text-slate-900 underline">
          {text.switchLink}
        </Link>
      </p>
    </div>
  );
}
