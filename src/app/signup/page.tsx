import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthForm } from "@/components/AuthForm";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  return <AuthForm mode="signup" />;
}
