import type { Prisma } from "@prisma/client";

// Starter data every new account gets. All of it is editable later.
// Priority: 1 = most important, in the order the bills are listed.

function nextYearIndia(now: Date): number {
  const year = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(now);
  return Number(year) + 1;
}

export function buildSampleData(now: Date) {
  return {
    profile: {
      create: { salaryAmount: 45000, payDay: 7, currentBalance: 0 },
    },
    bills: {
      create: [
        { name: "Rent", amount: 15000, dueDay: 1, frequency: "monthly", priority: 1, isVariable: false },
        { name: "Bike EMI", amount: 6000, dueDay: 5, frequency: "monthly", priority: 2, isVariable: false },
        { name: "Money sent home", amount: 5000, dueDay: 10, frequency: "monthly", priority: 3, isVariable: false },
        { name: "Phone and internet", amount: 1000, dueDay: 10, frequency: "monthly", priority: 4, isVariable: false },
        { name: "Groceries and commute", amount: 8000, dueDay: 1, frequency: "monthly", priority: 5, isVariable: true },
        { name: "Credit card", amount: 0, dueDay: 22, frequency: "monthly", priority: 6, isVariable: true },
        { name: "Bike insurance", amount: 4800, dueDay: 15, dueMonth: 2, frequency: "yearly", priority: 7, isVariable: false },
      ],
    },
    incomes: {
      create: [
        { name: "Roommate share", amount: 3000, expectedDay: 15, frequency: "monthly", isReliable: false },
      ],
    },
    goals: {
      create: [
        {
          name: "Laptop",
          targetAmount: 60000,
          savedAmount: 12000,
          deadline: new Date(Date.UTC(nextYearIndia(now), 3, 1)), // 1 April next year
        },
      ],
    },
  } satisfies Omit<Prisma.UserCreateInput, "email" | "passwordHash">;
}
