import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getPlanForUser } from "@/lib/plan-service";

export async function GET() {
  const result = await getPlanForUser();
  if (!result.ok) return jsonError(result.status, result.error);
  if (!result.data.next) return jsonError(500, result.data.nextError ?? "We couldn't work out your next salary.");
  return NextResponse.json(result.data.next);
}
