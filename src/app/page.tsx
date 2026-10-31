import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logout } from "@/app/actions/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <p className="rounded-lg bg-white p-4 shadow-sm">
        Logged in as <span className="font-medium break-all">{user.email}</span>
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium hover:bg-slate-100"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
