# Salary Day Autopilot

Next.js 15 (App Router, TypeScript, Tailwind CSS 4) + Prisma 6 + PostgreSQL.
Tells you what's safe to spend until your next salary, and shows every decision in plain words.

## Demo login

After setup, create the demo account once:

```bash
npm run demo:create
```

Then log in with **arjun@demo.com** / **Demo@1234** (name "Arjun", the sample bills, ₹20,000 in
the account as of when the script ran). The script only inserts: if the account already exists it
prints "Demo account already exists" and changes nothing.

## Requirements

- Node.js 22.12 or newer (Vitest 5 requires it; built and tested on Node 22.19)
- A PostgreSQL database (local, or hosted such as Neon, Supabase or Vercel Postgres)

## Setup

Run all commands from the project root (the folder that contains `package.json`).

1. Install dependencies (this also runs `prisma generate`):

   ```bash
   npm install
   ```

2. Create your env file and fill in real values:

   ```bash
   cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
   ```

   - `DATABASE_URL`: your PostgreSQL connection string.
   - `SESSION_SECRET`: at least 32 random characters. Generate one with:

     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
     ```

3. Create the database tables (first time, and after every schema change):

   ```bash
   npx prisma migrate dev
   ```

   This applies the migrations in `prisma/migrations/` to the database in `DATABASE_URL`.
   After changing `schema.prisma`, run `npx prisma migrate dev --name <what-changed>` and commit
   the new folder it creates.

4. Start the dev server:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. You will be sent to `/login`; use "Create an account" to sign up.

## Scripts

| Command             | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Dev server on port 3000                              |
| `npm run build`     | `prisma generate` + production build                 |
| `npm start`         | Run the production build                             |
| `npm run typecheck` | TypeScript check, no output files                    |
| `npm test`          | Vitest unit tests (money engine in `src/lib/engine`) |
| `npm run db:migrate`| `prisma migrate dev` (development database)          |
| `npm run db:deploy` | `prisma migrate deploy` (apply committed migrations) |
| `npm run demo:create` | Create the demo account (insert only, safe to re-run) |

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel (framework preset: Next.js).
2. In Project Settings → Environment Variables, set `DATABASE_URL` and `SESSION_SECRET`.
3. Apply migrations to the production database from your machine:

   ```bash
   DATABASE_URL="<production url>" npx prisma migrate deploy
   ```

   The Vercel build does **not** run migrations on its own.

## How it decides

All of this is plain TypeScript in `src/lib/engine/`. All money is whole rupees, all dates are
India time (Asia/Kolkata), and every step writes one sentence you can read under
"What I did and why".

**The month** runs from this month's actual pay date to the next one. A pay day on a weekend or
holiday moves to the next working day (holidays are listed in `src/lib/engine/dates.ts`).

**Starting balance.** "Money in your account right now" is taken as true at the moment you save it:

- This month's salary is already inside it, so it isn't added again.
- Bills due on or before that day count as paid.
- Entries logged before it are ignored, except card spends, which are still owed.
- A balance from before this month's payday is out of date, so it's left out with a warning.
- Salary and money logged after it are added.

**Priority order.** Money is set aside top to bottom:

1. Last month's shortfall (next salary plan only)
2. Rent
3. EMI
4. Other monthly bills
5. Credit card (card spends since the last card payment)
6. Yearly bills: what's left ÷ paydays until due
7. Groceries and commute (only the days left, if you start mid-month)
8. Emergency buffer (₹2,000)
9. Goals: what's left ÷ paydays until the deadline, only from money beyond a ₹3,000 spending floor
10. Spending money: whatever is left

**Cut order.** If the salary comes in short (or unpaid leave lowers it), cuts start at the bottom:
spending money → goals → buffer → groceries → yearly → credit card → other bills → EMI → rent.

**Expenses** are paid from spending money, then the buffer, then goals, then groceries. They never
use bill money. Anything still missing is shown as "Short by ₹X" with a warning.

**Safe to spend today** = spending money left ÷ days until your next salary, rounded down.

**Late salary.** If you set a late salary date, bills due between the normal payday and that date
are held back from this month's spending money.

**Next salary plan.** This covers the next payday to the one after. It starts from the expected
salary, minus 1/30 for each unpaid leave day, plus the carry-in. The carry-in is this month's
buffer left minus this month's shortfall; if it's negative, it's paid first. This month's yearly
set-asides and goal money count as already saved, and groceries are budgeted for the full month.

**Checks.** `checkInvariant()` confirms the buckets add up exactly to the money available. Run the
engine tests with:

```bash
npx vitest run src/lib/engine     # or: npm test
```

## How auth works

- Passwords are hashed with bcrypt (`bcryptjs`, cost 10). Older cost-12 hashes still verify and are
  re-hashed at cost 10 on the next successful login.
- On login/sign-up the server sets an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production)
  holding a JWT signed with HS256 via `jose`. It expires after 7 days.
- `src/middleware.ts` checks the cookie signature on every route except `/login` and `/signup`.
  Pages are redirected to `/login`; `/api/*` routes get a `401` JSON response.
- `getCurrentUser()` (`src/lib/auth/current-user.ts`) reads the cookie and loads the user from the
  database. Use it in every page, route handler and server action.
- On sign-up the account is filled with sample data (`src/lib/sample-data.ts`) in the same
  database transaction as the user.

## Rules for new API routes and server actions

- Get the user with `getCurrentUser()`. If it returns `null`, return `unauthorized()` (401) from
  `src/lib/http.ts`.
- Never accept a `userId` from the request body, query or URL. Always use `user.id`.
- Look records up with both the id and the owner, e.g.
  `prisma.bill.findFirst({ where: { id, userId: user.id } })`. If that returns `null`, return
  `notFound()` (404). This covers both "doesn't exist" and "belongs to someone else".
- Validate every input with a zod schema and return the first issue's message
  (`firstErrorMessage()` in `src/lib/validation.ts`) as a 400. Wrap database calls in
  `try/catch` and return a plain-English message instead of throwing.

## Project layout

```
prisma/schema.prisma          database schema
src/middleware.ts             route protection
src/app/actions/auth.ts       signup / login / logout server actions
src/app/api/me/route.ts       GET current user (401 when logged out)
src/app/login, src/app/signup auth pages
src/app/page.tsx              home screen
src/app/settings/             My details
src/lib/engine/               the money engine and its tests
scripts/create-demo.ts        demo account script
src/components/AuthForm.tsx   shared login/sign-up form
src/lib/auth/                 session cookie, password hashing, getCurrentUser
src/lib/validation.ts         zod schemas
src/lib/sample-data.ts        data prefilled on sign-up
```
