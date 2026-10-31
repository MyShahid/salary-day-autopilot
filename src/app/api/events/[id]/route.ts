import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { deleteEvent } from "@/lib/plan-service";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deleteEvent(id);
  if (!result.ok) return jsonError(result.status, result.error);
  return NextResponse.json(result.data);
}
