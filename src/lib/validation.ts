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

const personName = z
  .string({ error: "Please enter your name." })
  .trim()
  .min(1, "Please enter your name.")
  .max(50, "Please keep your name under 50 characters.");

export const nameSchema = z.object({ name: personName });

export const signupSchema = z.object({
  name: personName,
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

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Whole rupees from a form string or JSON number. Accepts "12,000" and "₹12000".
 * `subject` names the field in messages, e.g. "The amount" or "Your salary".
 */
function rupeesField(subject: string, { allowZero }: { allowZero: boolean }) {
  return z.union([z.string(), z.number()], { error: `Please enter ${lowerFirst(subject)}.` }).transform((value, ctx) => {
    const fail = (message: string) => {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    };
    const text = typeof value === "number" ? String(value) : value.trim().replace(/[₹,\s]/g, "");
    if (text === "") return fail(`Please enter ${lowerFirst(subject)}.`);
    if (text.startsWith("-")) return fail(`${subject} can't be negative.`);
    if (!/^\d+(\.\d+)?$/.test(text)) return fail(`${subject} must be a number, like 12000.`);
    const amount = Number(text);
    if (!Number.isInteger(amount)) return fail(`${subject} must be whole rupees, without paise.`);
    if (amount === 0 && !allowZero) return fail(`${subject} must be more than ₹0.`);
    if (amount > MAX_EVENT_AMOUNT) return fail(`${subject} is too large. The most allowed is ${formatRupees(MAX_EVENT_AMOUNT)}.`);
    return amount;
  });
}

const rupees = rupeesField("The amount", { allowZero: false });

/** A whole number in [min, max] from a form string or JSON number. */
function wholeNumberField(subject: string, min: number, max: number) {
  const message = `${subject} must be a whole number from ${min} to ${max}.`;
  return z.union([z.string(), z.number()], { error: message }).transform((value, ctx) => {
    const text = typeof value === "number" ? String(value) : value.trim();
    const n = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return n;
  });
}

/** Checkbox "on" from a form, or a JSON boolean. Missing means no. */
const yesNo = z
  .union([z.boolean(), z.string()])
  .nullish()
  .transform((v) => v === true || v === "on" || v === "true" || v === "yes");

const itemName = z
  .string({ error: "Please enter a name." })
  .trim()
  .min(1, "Please enter a name.")
  .max(60, "Please keep the name under 60 characters.");

export const profileSchema = z.object({
  salaryAmount: rupeesField("Your salary", { allowZero: true }),
  payDay: wholeNumberField("Pay day", 1, 31),
});

/** Unpaid leave and a late salary date for the next salary. A blank date means "on time". */
export function nextSalarySchema(today: ISODate) {
  const latest = addDays(today, 62);
  return z.object({
    unpaidLeaveDays: wholeNumberField("Unpaid leave days", 0, 31),
    nextSalaryDate: z
      .string()
      .trim()
      .nullish()
      .transform((v) => v || null)
      .refine((d) => d === null || parseISODate(d) !== null, "Please choose a valid date, or leave it blank if your salary is on time.")
      .refine((d) => d === null || d >= today, "The date your salary arrives can't be in the past.")
      .refine((d) => d === null || d <= latest, "That date is too far away. Choose a date in the next two months."),
  });
}

export const balanceSchema = z.object({
  currentBalance: rupeesField("The money in your account", { allowZero: true }),
});

export const billSchema = z
  .object({
    name: itemName,
    amount: rupeesField("The amount", { allowZero: true }),
    dueDay: wholeNumberField("The due day", 1, 31),
    frequency: z.enum(["monthly", "yearly"], { error: "Please choose monthly or yearly." }),
    dueMonth: z.union([z.string(), z.number()]).nullish(),
    isVariable: yesNo,
  })
  .transform((bill, ctx) => {
    if (bill.frequency === "monthly") return { ...bill, dueMonth: null };
    const parsed = wholeNumberField("The due month", 1, 12).safeParse(bill.dueMonth ?? "");
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "Please choose the month a yearly bill is due." });
      return z.NEVER;
    }
    return { ...bill, dueMonth: parsed.data };
  });

export const incomeSchema = z.object({
  name: itemName,
  amount: rupeesField("The amount", { allowZero: false }),
  expectedDay: wholeNumberField("The expected day", 1, 31),
  frequency: z.enum(["monthly", "yearly", "oneoff"], { error: "Please choose monthly, yearly or one-off." }),
  isReliable: yesNo,
});

export function goalSchema(today: ISODate) {
  const latest = addDays(today, 365 * 50);
  return z.object({
    name: itemName,
    targetAmount: rupeesField("The target", { allowZero: false }),
    savedAmount: rupeesField("The amount saved so far", { allowZero: true }),
    deadline: z
      .string({ error: "Please choose a deadline." })
      .trim()
      .refine((d) => parseISODate(d) !== null, "Please choose a valid deadline.")
      .refine((d) => d >= today, "The deadline must be today or later.")
      .refine((d) => d <= latest, "The deadline is too far away."),
  });
}

export const itemIdSchema = z
  .string({ error: "We couldn't find that." })
  .trim()
  .min(1, "We couldn't find that.")
  .max(64, "We couldn't find that.");

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
