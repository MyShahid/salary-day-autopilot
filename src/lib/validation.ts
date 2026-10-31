import { z } from "zod";

const passwordTooLong = (value: string) => new TextEncoder().encode(value).length <= 72;

const email = z
  .string({ error: "Please enter your email." })
  .trim()
  .toLowerCase()
  .min(1, "Please enter your email.")
  .max(254, "That email address is too long.")
  .pipe(z.email("Please enter a valid email address."));

export const signupSchema = z.object({
  email,
  password: z
    .string({ error: "Please enter a password." })
    .min(8, "Your password must be at least 8 characters.")
    // bcrypt only uses the first 72 bytes, so reject anything longer.
    .refine(passwordTooLong, "Your password is too long. Please keep it under 72 characters."),
});

export const loginSchema = z.object({
  email,
  password: z
    .string({ error: "Please enter your password." })
    .min(1, "Please enter your password.")
    .refine(passwordTooLong, "Email or password is incorrect."),
});

/** First validation problem as a plain-English sentence. */
export function firstErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check what you entered and try again.";
}
