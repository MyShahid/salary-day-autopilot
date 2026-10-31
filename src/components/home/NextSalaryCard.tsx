import { formatRupees } from "@/lib/engine/format";
import type { NextSalaryPlan } from "@/lib/engine/types";
import { formatDayDate } from "@/lib/format-ui";

export function NextSalaryCard({ next, today }: { next: NextSalaryPlan; today: string }) {
  const { plan } = next;
  const fmt = (d: string) => formatDayDate(d, today);
  const where = plan.buckets.filter((b) => b.planned > 0);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">
          Next salary: {fmt(next.salaryDate)} — {formatRupees(next.expectedSalary)}
        </h2>
        {next.late && <p className="text-sm text-amber-800">Late: normally {fmt(next.payDate)}.</p>}
        {next.leaveCut > 0 && (
          <p className="text-sm text-slate-600">
            {formatRupees(next.fullSalary)} minus {formatRupees(next.leaveCut)} for {next.unpaidLeaveDays} unpaid leave{" "}
            {next.unpaidLeaveDays === 1 ? "day" : "days"}.
          </p>
        )}
      </div>

      {plan.warnings.map((w) => (
        <p key={w} role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {w}
        </p>
      ))}

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Where it goes</h3>
        <ul className="mt-1 divide-y divide-slate-100 text-sm">
          {where.map((b) => (
            <li key={b.id} className="flex justify-between gap-3 py-1.5">
              <span className="min-w-0 break-words">{b.name}</span>
              <span className="shrink-0 font-medium">{formatRupees(b.planned)}</span>
            </li>
          ))}
          {plan.shortfall > 0 && (
            <li className="flex justify-between gap-3 py-1.5 font-medium text-red-700">
              <span>Still short</span>
              <span>{formatRupees(plan.shortfall)}</span>
            </li>
          )}
        </ul>
      </div>

      <p className="text-sm">
        Left to spend: <span className="font-semibold">{formatRupees(plan.safeToSpendToday)} a day</span> for{" "}
        {plan.cycle.daysLeft} days, until {fmt(plan.cycle.end)}.
      </p>

      {plan.goalStatus.map((g) => (
        <p key={g.goalId} className="text-sm">
          <span className="font-medium">{g.name}:</span>{" "}
          <span className={g.onTrack ? "text-emerald-700" : "text-amber-800"}>{g.text}</span>
        </p>
      ))}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">What I'll do and why ({plan.decisions.length} steps)</summary>
        <ol className="mt-2 space-y-2 text-slate-700">
          {plan.decisions.map((d, i) => (
            <li key={i}>{d.sentence}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}
