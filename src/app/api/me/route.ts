import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { badJson, readJson, toResponse, unauthorized } from "@/lib/http";
import { updateName } from "@/lib/settings-service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return unauthorized();
  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
}

/** Change your name: { name }. */
export async function PATCH(req: Request) {
  const body = await readJson(req);
  return body ? toResponse(await updateName(body)) : badJson();
}
