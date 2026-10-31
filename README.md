# Salary Day Autopilot

Next.js 15 (App Router, TypeScript, Tailwind CSS 4) + Prisma 6 + PostgreSQL.
This stage contains the project scaffold and email + password auth only.

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
   npx prisma migrate dev --name init
   ```

   This writes SQL into `prisma/migrations/` and applies it to the database in `DATABASE_URL`.
   Commit the `prisma/migrations/` folder.

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

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel (framework preset: Next.js).
2. In Project Settings → Environment Variables, set `DATABASE_URL` and `SESSION_SECRET`.
3. Apply migrations to the production database from your machine:

   ```bash
   DATABASE_URL="<production url>" npx prisma migrate deploy
   ```

   The Vercel build does **not** run migrations on its own.

## How auth works

- Passwords are hashed with bcrypt (`bcryptjs`, cost 12).
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
src/app/page.tsx              placeholder home page
src/components/AuthForm.tsx   shared login/sign-up form
src/lib/auth/                 session cookie, password hashing, getCurrentUser
src/lib/validation.ts         zod schemas
src/lib/sample-data.ts        data prefilled on sign-up
```
