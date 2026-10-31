// Creates the demo account: arjun@demo.com / Demo@1234, name "Arjun", the sign-up
// sample data, and ₹20,000 in the account as of now.
//
// INSERT only. If the email already exists it prints "Demo account already exists"
// and changes nothing, so running it twice adds 0 rows.
//
// Run from the project folder: npm run demo:create   (uses DATABASE_URL from .env)

import { Prisma, PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { buildSampleData } from "../src/lib/sample-data";

const DEMO = { email: "arjun@demo.com", password: "Demo@1234", name: "Arjun", balance: 20000 };

async function main() {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: DEMO.email }, select: { id: true } });
    if (existing) {
      console.log("Demo account already exists");
      return;
    }

    const now = new Date();
    const sample = buildSampleData(now);
    // One nested create = one transaction: the user and all its data, or nothing.
    const user = await prisma.user.create({
      data: {
        email: DEMO.email,
        name: DEMO.name,
        passwordHash: await hashPassword(DEMO.password),
        ...sample,
        profile: { create: { ...sample.profile.create, currentBalance: DEMO.balance, balanceAsOf: now } },
      },
      select: { _count: { select: { bills: true, incomes: true, goals: true } } },
    });
    const c = user._count;
    console.log(
      `Created demo account ${DEMO.email} (password ${DEMO.password}): 1 user, 1 profile, ${c.bills} bills, ${c.incomes} income, ${c.goals} goal; balance ₹20,000 as of now.`,
    );
  } catch (err) {
    // Two runs at once: the second insert hits the unique email and is a no-op too.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      console.log("Demo account already exists");
      return;
    }
    console.error("Could not create the demo account:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
