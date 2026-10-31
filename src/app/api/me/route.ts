import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { unauthorized } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return NextResponse.json({ id: user.id, email: user.email });
}
