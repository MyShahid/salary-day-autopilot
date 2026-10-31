// Shared by the server and the log form, so no server-only imports here.
import type { EventType } from "@/lib/engine/types";

export const EVENT_TYPES = ["salary_received", "card_spend", "expense", "income_received", "bill_paid"] as const satisfies readonly EventType[];

export const EVENT_LABELS: Record<EventType, string> = {
  salary_received: "Salary arrived",
  card_spend: "Card spend",
  expense: "Unexpected expense",
  income_received: "Money received",
  bill_paid: "Bill paid",
};

/** Dropdown value for "Other (bonus etc.)" under Money received. */
export const OTHER_INCOME = "__other__";

/** Largest single amount accepted (₹10 crore), well inside the database's integer range. */
export const MAX_EVENT_AMOUNT = 100_000_000;
