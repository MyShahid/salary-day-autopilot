import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { addEvent } from "@/lib/plan-service";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "We couldn't read that request. Please send JSON.");
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const result = await addEvent(b.type, b.amount, b.date, b.billOrIncomeName, b.note);
  if (!result.ok) return jsonError(result.status, result.error);
  return NextResponse.json(result.data, { status: 201 });
}
