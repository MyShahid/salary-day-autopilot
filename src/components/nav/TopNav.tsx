import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "@/app/actions/auth";
import { NavLinks } from "./NavLinks";

/** One line, even on a phone: name · Home · My details ··· Log out. Hidden when logged out. */
export async function TopNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav aria-label="Main" className="mx-auto flex w-full max-w-xl items-center gap-1 px-2 py-2 text-sm font-medium sm:px-4">
        {user.name && (
          <span className="max-w-[6.5rem] truncate px-2 font-bold text-slate-950" title={user.name}>
            {user.name}
          </span>
        )}
        <NavLinks />
        <form action={logout} className="ml-auto shrink-0">
          <button type="submit" className="rounded-md px-2.5 py-2 whitespace-nowrap text-slate-700 hover:bg-slate-100">
            Log out
          </button>
        </form>
      </nav>
    </header>
  );
}
