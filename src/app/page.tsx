import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "@/app/actions/auth";
import { formatRupees } from "@/lib/engine/format";
import type { Plan } from "@/lib/engine/types";
import { EVENT_LABELS } from "@/lib/events";
import { formatDayDate } from "@/lib/format-ui";
import { getPlanForUser } from "@/lib/plan-service";
import { LogEventForm } from "@/components/home/LogEventForm";
import { UndoButton } from "@/components/home/UndoButton";

const STATUS_STYLE: Record<Plan["status"], string> = {
  okay: "border-emerald-300 bg-emerald-50 text-emerald-950",
  tight: "border-amber-300 bg-amber-50 text-amber-950",
  short: "border-red-300 bg-red-50 text-red-950",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Footer({ email }: { email: string }) {
  return (
    <footer className="space-y-3 border-t border-slate-200 pt-4 text-sm text-slate-600">
      <p>
        Logged in as <span className="font-medium break-all">{email}</span>
      </p>
      <form action={logout}>
        <button type="submit" className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium">
          Log out
        </button>
      </form>
    </footer>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await getPlanForUser();
  if (!result.ok) {
    return (
      <div className="space-y-6">
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
          <p className="font-semibold">We couldn't work out your plan.</p>
          <p className="mt-1 text-sm">{result.error}</p>
        </div>
        <Footer email={user.email} />
      </div>
    );
  }

  const { plan, today, recentEvents, billNames, incomeNames } = result.data;
  const fmtDate = (d: string) => formatDayDate(d, today);
  const shortfallWarnings = plan.warnings.filter(
    (w) => w.includes("more than your spare money") || w.includes(" short before payday"),
  );
  const otherWarnings = plan.warnings.filter((w) => !shortfallWarnings.includes(w));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href="/settings" className="text-sm font-medium underline">
          My details
        </Link>
      </div>

      <div className={`rounded-xl border p-4 ${STATUS_STYLE[plan.status]}`}>
        <p className="text-lg font-semibold">{plan.headline}</p>
        <p className="mt-3 text-sm">Safe to spend today</p>
        <p className="text-4xl font-bold tracking-tight">{formatRupees(plan.safeToSpendToday)}</p>
        <p className="text-sm">until salary on {fmtDate(plan.cycle.end)}</p>
        <p className="mt-3 border-t border-black/10 pt-3 font-medium">{plan.nextAction}</p>
      </div>

      {(shortfallWarnings.length > 0 || plan.expectedNotCounted.length > 0 || otherWarnings.length > 0) && (
        <div className="space-y-2">
          {shortfallWarnings.map((w) => (
            <p key={w} role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
              {w}
            </p>
          ))}
          {plan.expectedNotCounted.map((x) => (
            <p key={x.text} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {x.text}
            </p>
          ))}
          {otherWarnings.map((w) => (
            <p key={w} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              {w}
            </p>
          ))}
        </div>
      )}

      <LogEventForm today={today} billNames={billNames} incomeNames={incomeNames} />

      <Section title="Upcoming bills">
        {plan.upcomingBills.length === 0 ? (
          <p className="rounded-lg bg-white p-3 text-sm text-slate-600 shadow-sm">No bills due before your next salary.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
            {plan.upcomingBills.map((b) => (
              <li key={`${b.billId}-${b.dueDate}`} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium break-words">{b.name}</p>
                  <p className={`text-sm ${b.overdue ? "font-medium text-red-700" : "text-slate-600"}`}>
                    {b.overdue ? `Was due ${fmtDate(b.dueDate)}` : `Due ${fmtDate(b.dueDate)}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{formatRupees(b.amount)}</p>
                  <p className={`text-sm ${b.reserved ? "text-emerald-700" : "font-medium text-red-700"}`}>
                    {b.reserved ? "Money set aside ✓" : "Not covered ✗"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {plan.goalStatus.length > 0 && (
        <Section title="Goals">
          <ul className="space-y-1 rounded-lg bg-white p-3 shadow-sm">
            {plan.goalStatus.map((g) => (
              <li key={g.goalId} className="text-sm">
                <span className="font-medium">{g.name}:</span>{" "}
                <span className={g.onTrack ? "text-emerald-700" : "text-amber-800"}>{g.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent entries">
        {recentEvents.length === 0 ? (
          <p className="rounded-lg bg-white p-3 text-sm text-slate-600 shadow-sm">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm">
            {recentEvents.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {EVENT_LABELS[e.type]}
                    {e.note ? <span className="font-normal text-slate-600"> · {e.note}</span> : null}
                  </p>
                  <p className="text-slate-600">
                    {formatRupees(e.amount)} · {fmtDate(e.date)}
                  </p>
                </div>
                <UndoButton id={e.id} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="What I did and why">
        <details className="rounded-lg bg-white p-3 shadow-sm">
          <summary className="cursor-pointer text-sm font-medium">
            Show all {plan.decisions.length} steps, newest first
          </summary>
          <ol className="mt-2 space-y-2 text-sm text-slate-700">
            {[...plan.decisions].reverse().map((d, i) => (
              <li key={i}>{d.sentence}</li>
            ))}
          </ol>
        </details>
      </Section>

      <Footer email={user.email} />
    </div>
  );
}
