import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "@/app/actions/auth";
import { NavLinks } from "./NavLinks";

/**
 * One line, even at 360px: app name · Home · My details ··· name · Log out.
 * Everything keeps its size except the name, which shrinks and truncates.
 * Hidden when logged out.
 */
export async function TopNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav aria-label="Main" className="mx-auto flex w-full max-w-xl items-center gap-0.5 px-2 py-2 text-sm font-medium sm:gap-1 sm:px-4">
        <Link href="/" className="shrink-0 px-1.5 py-2 font-extrabold whitespace-nowrap text-slate-950">
          <span className="sm:hidden">Autopilot</span>
          <span className="hidden sm:inline">Salary Day Autopilot</span>
        </Link>
        <NavLinks />
        {user.name && (
          <span className="ml-auto min-w-0 max-w-[10rem] truncate px-1.5 font-semibold text-slate-950" title={user.name}>
            {user.name}
          </span>
        )}
        <form action={logout} className={`shrink-0 ${user.name ? "" : "ml-auto"}`}>
          <button type="submit" className="rounded-md px-2 py-2 whitespace-nowrap text-slate-700 hover:bg-slate-100">
            Log out
          </button>
        </form>
      </nav>
    </header>
  );
}
