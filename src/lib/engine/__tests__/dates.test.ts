import { describe, expect, it } from "vitest";
import { actualPayDate, clampDueDate, payCycle, toIndiaDate } from "../dates";
import { formatRupees } from "../format";

describe("clampDueDate", () => {
  it("bill due 31st in February falls on Feb 28", () => {
    expect(clampDueDate(2027, 2, 31)).toBe("2027-02-28");
  });

  it("bill due 31st in February 2028 (leap year) falls on Feb 29", () => {
    expect(clampDueDate(2028, 2, 31)).toBe("2028-02-29");
  });

  it("keeps days that exist and handles 30-day months", () => {
    expect(clampDueDate(2026, 11, 10)).toBe("2026-11-10");
    expect(clampDueDate(2026, 4, 31)).toBe("2026-04-30");
  });
});

describe("actualPayDate", () => {
  it("7th is a Saturday -> pay date is Monday 9th", () => {
    expect(actualPayDate(2026, 11, 7)).toBe("2026-11-09");
  });

  it("7th is a holiday -> next working day", () => {
    // 7 Dec 2026 is a Monday; mark it as a holiday.
    expect(actualPayDate(2026, 12, 7, [{ month: 12, day: 7 }])).toBe("2026-12-08");
    expect(actualPayDate(2026, 12, 7, ["2026-12-07"])).toBe("2026-12-08");
  });

  it("Pongal on a Friday rolls over the weekend to Monday", () => {
    // 15 Jan 2027 is a Friday and Pongal is in the default list.
    expect(actualPayDate(2027, 1, 15)).toBe("2027-01-18");
  });

  it("a working day stays put", () => {
    expect(actualPayDate(2026, 12, 7)).toBe("2026-12-07");
  });
});

describe("India timezone", () => {
  it("uses the Asia/Kolkata date, not UTC", () => {
    expect(toIndiaDate(new Date("2026-11-09T19:00:00Z"))).toBe("2026-11-10"); // 00:30 IST
    expect(toIndiaDate(new Date("2026-11-08T18:00:00Z"))).toBe("2026-11-08"); // 23:30 IST
    expect(toIndiaDate(new Date("2026-11-10T00:00:00Z"))).toBe("2026-11-10"); // DB date column
    expect(toIndiaDate("2026-11-10")).toBe("2026-11-10");
    expect(toIndiaDate("2026-02-30")).toBeNull();
    expect(toIndiaDate("nonsense")).toBeNull();
  });

  it("pay cycle starts on payday in India time", () => {
    // Just after midnight IST on Mon 9 Nov is already payday.
    const onPayday = payCycle(toIndiaDate(new Date("2026-11-08T19:00:00Z"))!, 7);
    expect(onPayday).toMatchObject({ start: "2026-11-09", end: "2026-12-07" });
    // 23:30 IST on Sun 8 Nov is still the previous cycle.
    const before = payCycle(toIndiaDate(new Date("2026-11-08T18:00:00Z"))!, 7);
    expect(before).toMatchObject({ start: "2026-10-07", end: "2026-11-09" });
  });

  it("a pay date pushed into next month still finds the right cycle", () => {
    // Pay day 31: 31 Oct 2026 is a Saturday, so October's salary arrives Mon 2 Nov.
    expect(payCycle("2026-11-01", 31)).toMatchObject({ start: "2026-09-30", end: "2026-11-02" });
    expect(payCycle("2026-11-02", 31)).toMatchObject({ start: "2026-11-02", end: "2026-11-30" });
  });
});

describe("formatRupees", () => {
  it("uses Indian digit grouping", () => {
    expect(formatRupees(500)).toBe("₹500");
    expect(formatRupees(45000)).toBe("₹45,000");
    expect(formatRupees(120000)).toBe("₹1,20,000");
    expect(formatRupees(10000000)).toBe("₹1,00,00,000");
  });
});
