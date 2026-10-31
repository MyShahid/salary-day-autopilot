"use client";

import { useState } from "react";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Monthly/yearly choice; the due month only appears for yearly bills. */
export function BillFrequencyFields({
  frequency: initial = "monthly",
  dueMonth,
  inputClass,
}: {
  frequency?: "monthly" | "yearly";
  dueMonth?: number | null;
  inputClass: string;
}) {
  const [frequency, setFrequency] = useState(initial);
  return (
    <>
      <label className="block space-y-1">
        <span className="text-sm font-medium">How often</span>
        <select
          name="frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as "monthly" | "yearly")}
          className={inputClass}
        >
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </label>
      {frequency === "yearly" && (
        <label className="block space-y-1">
          <span className="text-sm font-medium">Month it's due</span>
          <select name="dueMonth" defaultValue={dueMonth ?? ""} className={inputClass}>
            <option value="" disabled>
              Choose a month
            </option>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
