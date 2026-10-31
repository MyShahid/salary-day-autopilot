import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "@/app/actions/auth";
import { NavLinks } from "./NavLinks";

/** Home · My details · Log out, with the email small underneath. Hidden when logged out. */
export async function TopNav() {
  const user = await getCurrentUser();
  if (!user) return null;
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-xl px-4 py-2">
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium">
          <NavLinks />
          <form action={logout} className="ml-auto">
            <button type="submit" className="rounded-md px-3 py-2 text-slate-700 hover:bg-slate-100">
              Log out
            </button>
          </form>
        </nav>
        <p className="truncate px-3 pb-1 text-xs text-slate-500">
          {user.name ? (
            <>
              <span className="font-semibold text-slate-800">{user.name}</span> · {user.email}
            </>
          ) : (
            user.email
          )}
        </p>
      </div>
    </header>
  );
}
