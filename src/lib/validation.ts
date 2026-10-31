import { z } from "zod";
import { addDays, parseISODate, type ISODate } from "@/lib/engine/dates";
import { formatRupees } from "@/lib/engine/format";
import { EVENT_TYPES, MAX_EVENT_AMOUNT } from "@/lib/events";

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

/** Whole rupees from a form string or JSON number. Accepts "12,000" and "₹12000". */
const rupees = z.union([z.string(), z.number()], { error: "Please enter an amount." }).transform((value, ctx) => {
  const fail = (message: string) => {
    ctx.addIssue({ code: "custom", message });
    return z.NEVER;
  };
  const text = typeof value === "number" ? String(value) : value.trim().replace(/[₹,\s]/g, "");
  if (text === "") return fail("Please enter an amount.");
  if (text.startsWith("-")) return fail("The amount can't be negative.");
  if (!/^\d+(\.\d+)?$/.test(text)) return fail("Please enter the amount as a number, like 12000.");
  const amount = Number(text);
  if (!Number.isInteger(amount)) return fail("Please enter whole rupees, without paise.");
  if (amount === 0) return fail("The amount must be more than ₹0.");
  if (amount > MAX_EVENT_AMOUNT) return fail(`That amount is too large. The most you can log at once is ${formatRupees(MAX_EVENT_AMOUNT)}.`);
  return amount;
});

const optionalText = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .nullish()
    .transform((v) => v || undefined);

/** Event dates: a real calendar day, not in the future, at most a year back. */
export function addEventSchema(today: ISODate) {
  const earliest = addDays(today, -366);
  return z.object({
    type: z.enum(EVENT_TYPES, { error: "Please choose what you're logging." }),
    amount: rupees,
    date: z
      .string({ error: "Please choose a date." })
      .trim()
      .refine((d) => parseISODate(d) !== null, "Please choose a valid date.")
      .refine((d) => d <= today, "The date can't be in the future.")
      .refine((d) => d >= earliest, "The date is more than a year ago."),
    billOrIncomeName: optionalText(100, "That name is too long."),
    note: optionalText(200, "Please keep the note under 200 characters."),
  });
}

export const eventIdSchema = z
  .string({ error: "We couldn't find that entry." })
  .trim()
  .min(1, "We couldn't find that entry.")
  .max(64, "We couldn't find that entry.");

/** First validation problem as a plain-English sentence. */
export function firstErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check what you entered and try again.";
}
