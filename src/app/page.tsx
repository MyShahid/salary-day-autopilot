import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatRupees } from "@/lib/engine/format";
import type { Plan } from "@/lib/engine/types";
import { EVENT_LABELS } from "@/lib/events";
import { formatDayDate } from "@/lib/format-ui";
import { getPlanForUser } from "@/lib/plan-service";
import { Card } from "@/components/ui/Card";
import { LogEventForm } from "@/components/home/LogEventForm";
import { NextSalaryCard } from "@/components/home/NextSalaryCard";
import { RecentEntries } from "@/components/home/RecentEntries";
import { DecisionDisclosure, DecisionHighlightProvider } from "@/components/plan/DecisionList";

// Solid colours with white or near-black text, so the status reads at a glance in sunlight.
const STATUS_STYLE: Record<Plan["status"], string> = {
  okay: "bg-emerald-700 text-white",
  tight: "bg-amber-400 text-slate-950",
  short: "bg-red-700 text-white",
};

/**
 * "Hi Arjun, you're okay this month" / "Hi Arjun, you're short by ₹4,142" /
 * "Hi Arjun, it's tight this month: …". Just the headline when there's no name.
 */
function greeting(name: string | null, headline: string, status: Plan["status"]): string {
  const first = name?.trim();
  if (!first) return headline;
  const rest = `${headline.charAt(0).toLowerCase()}${headline.slice(1)}`;
  const lead = status === "short" ? "you're " : status === "tight" ? "it's " : "";
  return `Hi ${first}, ${lead}${rest}`;
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await getPlanForUser();
  if (!result.ok) {
    return (
      <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
        <p className="font-semibold">We couldn't work out your plan.</p>
        <p className="mt-1 text-sm">{result.error}</p>
      </div>
    );
  }

  const { plan, today, recentEvents, billNames, incomeNames, next, nextError } = result.data;
  const fmtDate = (d: string) => formatDayDate(d, today);
  const shortfallWarnings = plan.warnings.filter(
    (w) => w.includes("more than your spare money") || w.includes(" short before payday"),
  );
  const otherWarnings = plan.warnings.filter((w) => !shortfallWarnings.includes(w));

  return (
    // Room at the bottom on phones for the pinned "Log something" button.
    // The provider lets a new entry highlight the decisions it changed.
    <DecisionHighlightProvider>
    <div className="space-y-5 pb-24 sm:pb-0">
      <section aria-label="This month" className={`rounded-2xl p-5 shadow-sm ${STATUS_STYLE[plan.status]}`}>
        <h1 className="text-2xl leading-tight font-bold">{greeting(user.name, plan.headline, plan.status)}</h1>
        <p className="mt-4 text-sm font-semibold tracking-wide uppercase opacity-90">Safe to spend today</p>
        <p className="text-5xl leading-none font-extrabold tracking-tight tabular-nums">{formatRupees(plan.safeToSpendToday)}</p>
        <p className="mt-1 text-base">until salary on {fmtDate(plan.cycle.end)}</p>
        <p className="mt-4 rounded-xl bg-white p-3 text-base font-semibold text-slate-950">{plan.nextAction}</p>
      </section>

      {(shortfallWarnings.length > 0 || plan.expectedNotCounted.length > 0 || otherWarnings.length > 0) && (
        <div className="space-y-2">
          {shortfallWarnings.map((w) => (
            <p key={w} role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
              {w}
            </p>
          ))}
          {plan.expectedNotCounted.map((x) => (
            <p key={x.text} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {x.text}
            </p>
          ))}
          {otherWarnings.map((w) => (
            <p key={w} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {w}
            </p>
          ))}
        </div>
      )}

      <LogEventForm today={today} billNames={billNames} incomeNames={incomeNames} />

      <Card title="Upcoming bills">
        {plan.upcomingBills.length === 0 ? (
          <p className="p-4 text-sm text-slate-600">
            {billNames.length === 0 ? (
              <>
                You haven't added any bills yet.{" "}
                <Link href="/settings" className="font-medium text-slate-900 underline">
                  Add them in My details
                </Link>
                .
              </>
            ) : (
              "No more bills before your next salary."
            )}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {plan.upcomingBills.map((b) => (
              <li key={`${b.billId}-${b.dueDate}`} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{b.name}</p>
                  <p className={`text-sm ${b.overdue ? "font-medium text-red-700" : "text-slate-600"}`}>
                    {b.overdue ? `Was due ${fmtDate(b.dueDate)}` : `Due ${fmtDate(b.dueDate)}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold tabular-nums">{formatRupees(b.amount)}</p>
                  <p className={`text-sm ${b.reserved ? "text-emerald-700" : "font-semibold text-red-700"}`}>
                    {b.reserved ? "Money set aside ✓" : "Not covered ✗"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {plan.goalStatus.length > 0 && (
        <Card title="Goals">
          <ul className="space-y-1 p-4">
            {plan.goalStatus.map((g) => (
              <li key={g.goalId} className="text-sm">
                <span className="font-semibold">{g.name}:</span>{" "}
                <span className={g.onTrack ? "text-emerald-700" : "text-amber-800"}>{g.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-label="Recent entries" className="space-y-2">
        <h2 className="px-1 text-sm font-semibold tracking-wide text-slate-600 uppercase">Recent entries</h2>
        <RecentEntries
          rows={recentEvents.map((e) => ({
            id: e.id,
            title: EVENT_LABELS[e.type],
            note: e.note,
            detail: `${formatRupees(e.amount)} · ${fmtDate(e.date)}`,
          }))}
        />
      </section>

      <DecisionDisclosure
        title="How I planned your money"
        decisions={plan.decisions.map((d) => ({ kind: d.kind, sentence: d.sentence }))}
        newestFirst
      />

      {next ? (
        <NextSalaryCard next={next} today={today} />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{nextError}</p>
      )}
    </div>
    </DecisionHighlightProvider>
  );
}
