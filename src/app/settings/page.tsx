import Link from "next/link";
import { redirect } from "next/navigation";
import type { Bill, Goal, Income } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { toIndiaDate } from "@/lib/engine/dates";
import { formatRupees } from "@/lib/engine/format";
import { formatDayDate } from "@/lib/format-ui";
import { todayInIndia } from "@/lib/plan-service";
import { getSettingsData } from "@/lib/settings-service";
import {
  saveBalanceAction,
  saveBillAction,
  saveGoalAction,
  saveIncomeAction,
  saveProfileAction,
} from "@/app/actions/settings";
import { ActionForm } from "@/components/settings/ActionForm";
import { BillFrequencyFields } from "@/components/settings/BillFrequencyFields";
import { DeleteForm } from "@/components/settings/DeleteForm";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FREQUENCY_LABEL = { monthly: "monthly", yearly: "yearly", oneoff: "one-off" } as const;

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Money({ name, label, defaultValue, hint }: { name: string; label: string; defaultValue?: number; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input name={name} type="text" inputMode="numeric" autoComplete="off" defaultValue={defaultValue} className={inputClass} />
    </Field>
  );
}

function Day({ name, label, defaultValue }: { name: string; label: string; defaultValue?: number }) {
  return (
    <Field label={label} hint="1 to 31. Months without that day use their last day.">
      <input name={name} type="number" inputMode="numeric" min={1} max={31} defaultValue={defaultValue} className={inputClass} />
    </Field>
  );
}

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-5 w-5" />
      {label}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** One saved item: a summary line, with edit form and delete inside a disclosure. */
function Item({ summary, children }: { summary: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="rounded-lg bg-white shadow-sm">
      <summary className="cursor-pointer list-none p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm">{summary}</div>
          <span className="shrink-0 text-sm text-slate-500 underline">Edit</span>
        </div>
      </summary>
      <div className="space-y-4 border-t border-slate-100 p-3">{children}</div>
    </details>
  );
}

function AddItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-dashed border-slate-300 bg-white">
      <summary className="cursor-pointer p-3 text-sm font-medium">+ {label}</summary>
      <div className="border-t border-slate-100 p-3">{children}</div>
    </details>
  );
}

function BillFields({ bill }: { bill?: Bill }) {
  return (
    <>
      {bill && <input type="hidden" name="id" value={bill.id} />}
      <Field label="Name">
        <input name="name" type="text" maxLength={60} defaultValue={bill?.name} className={inputClass} />
      </Field>
      <Money name="amount" label="Amount (₹)" defaultValue={bill?.amount} hint="Use 0 for a credit card: it's worked out from your card spends." />
      <Day name="dueDay" label="Due day" defaultValue={bill?.dueDay} />
      <BillFrequencyFields frequency={bill?.frequency} dueMonth={bill?.dueMonth} inputClass={inputClass} />
      <Check name="isVariable" label="The amount changes each month (like groceries)" defaultChecked={bill?.isVariable} />
    </>
  );
}

function IncomeFields({ income }: { income?: Income }) {
  return (
    <>
      {income && <input type="hidden" name="id" value={income.id} />}
      <Field label="Name">
        <input name="name" type="text" maxLength={60} defaultValue={income?.name} className={inputClass} />
      </Field>
      <Money name="amount" label="Amount (₹)" defaultValue={income?.amount} />
      <Day name="expectedDay" label="Expected day" defaultValue={income?.expectedDay} />
      <Field label="How often">
        <select name="frequency" defaultValue={income?.frequency ?? "monthly"} className={inputClass}>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
          <option value="oneoff">One-off</option>
        </select>
      </Field>
      <Check name="isReliable" label="Reliable: count it before it arrives" defaultChecked={income?.isReliable} />
    </>
  );
}

function GoalFields({ goal, today }: { goal?: Goal; today: string }) {
  return (
    <>
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <Field label="Name">
        <input name="name" type="text" maxLength={60} defaultValue={goal?.name} className={inputClass} />
      </Field>
      <Money name="targetAmount" label="Target (₹)" defaultValue={goal?.targetAmount} />
      <Money name="savedAmount" label="Saved so far (₹)" defaultValue={goal?.savedAmount ?? 0} />
      <Field label="Deadline">
        <input
          name="deadline"
          type="date"
          min={today}
          defaultValue={goal ? toIndiaDate(goal.deadline) ?? "" : ""}
          className={inputClass}
        />
      </Field>
    </>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { welcome } = await searchParams;

  const result = await getSettingsData();
  if (!result.ok) {
    return (
      <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
        {result.error}
      </div>
    );
  }
  const { profile, bills, incomes, goals } = result.data;
  const today = todayInIndia();
  const fmt = (d: Date) => formatDayDate(toIndiaDate(d) ?? today, today);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My details</h1>
        <Link href="/" className="text-sm font-medium underline">
          Back to home
        </Link>
      </div>

      {welcome && (
        <p role="status" className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          We filled in sample numbers. Change them to yours, especially the money in your account right now.
        </p>
      )}

      <Section title="Money in your account right now">
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <ActionForm action={saveBalanceAction} submitLabel="Save balance">
            <Money
              name="currentBalance"
              label="Amount (₹)"
              defaultValue={profile?.currentBalance ?? 0}
              hint={
                profile
                  ? `Last updated ${fmt(profile.balanceAsOf)}. Saving sets it to right now: bills due before today count as paid.`
                  : "Saving sets it to right now."
              }
            />
          </ActionForm>
        </div>
      </Section>

      <Section title="Salary">
        <div className="rounded-lg bg-white p-3 shadow-sm">
          <ActionForm action={saveProfileAction}>
            <Money name="salaryAmount" label="Monthly salary (₹)" defaultValue={profile?.salaryAmount ?? 0} />
            <Day name="payDay" label="Pay day" defaultValue={profile?.payDay ?? 1} />
          </ActionForm>
        </div>
      </Section>

      <Section title="Bills">
        {bills.length === 0 && <p className="text-sm text-slate-600">No bills yet.</p>}
        {bills.map((b) => (
          <Item
            key={b.id}
            summary={
              <>
                <p className="font-medium break-words">{b.name}</p>
                <p className="text-slate-600">
                  {formatRupees(b.amount)}
                  {b.isVariable ? " (changes)" : ""} ·{" "}
                  {b.frequency === "yearly" && b.dueMonth
                    ? `yearly on ${b.dueDay} ${MONTHS[b.dueMonth - 1]}`
                    : `monthly on the ${ordinal(b.dueDay)}`}
                </p>
              </>
            }
          >
            <ActionForm action={saveBillAction}>
              <BillFields bill={b} />
            </ActionForm>
            <DeleteForm kind="bill" id={b.id} name={b.name} />
          </Item>
        ))}
        <AddItem label="Add a bill">
          <ActionForm action={saveBillAction} submitLabel="Add bill" resetOnSave>
            <BillFields />
          </ActionForm>
        </AddItem>
      </Section>

      <Section title="Other income">
        {incomes.length === 0 && <p className="text-sm text-slate-600">No other income yet.</p>}
        {incomes.map((i) => (
          <Item
            key={i.id}
            summary={
              <>
                <p className="font-medium break-words">{i.name}</p>
                <p className="text-slate-600">
                  {formatRupees(i.amount)} · {FREQUENCY_LABEL[i.frequency]}
                  {i.frequency === "monthly" ? ` on the ${ordinal(i.expectedDay)}` : ""} ·{" "}
                  {i.isReliable ? "reliable" : "not counted until it arrives"}
                </p>
              </>
            }
          >
            <ActionForm action={saveIncomeAction}>
              <IncomeFields income={i} />
            </ActionForm>
            <DeleteForm kind="income" id={i.id} name={i.name} />
          </Item>
        ))}
        <AddItem label="Add income">
          <ActionForm action={saveIncomeAction} submitLabel="Add income" resetOnSave>
            <IncomeFields />
          </ActionForm>
        </AddItem>
      </Section>

      <Section title="Goals">
        {goals.length === 0 && <p className="text-sm text-slate-600">No goals yet.</p>}
        {goals.map((g) => (
          <Item
            key={g.id}
            summary={
              <>
                <p className="font-medium break-words">{g.name}</p>
                <p className="text-slate-600">
                  {formatRupees(g.savedAmount)} of {formatRupees(g.targetAmount)} saved · by {fmt(g.deadline)}
                </p>
              </>
            }
          >
            <ActionForm action={saveGoalAction}>
              <GoalFields goal={g} today={today} />
            </ActionForm>
            <DeleteForm kind="goal" id={g.id} name={g.name} />
          </Item>
        ))}
        <AddItem label="Add a goal">
          <ActionForm action={saveGoalAction} submitLabel="Add goal" resetOnSave>
            <GoalFields today={today} />
          </ActionForm>
        </AddItem>
      </Section>
    </div>
  );
}
