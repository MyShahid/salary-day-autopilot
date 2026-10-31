import { NextResponse } from "next/server";
import type { ServiceResult } from "@/lib/service-result";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export const unauthorized = () => jsonError(401, "You need to log in first.");

// Use for records that don't exist or belong to another user, so ownership is never revealed.
export const notFound = () => jsonError(404, "We couldn't find that.");

/** The JSON body as an object, or null if it isn't readable JSON. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

export const badJson = () => jsonError(400, "We couldn't read that request. Please send JSON.");

export function toResponse<T>(result: ServiceResult<T>, successStatus = 200) {
  return result.ok ? NextResponse.json(result.data, { status: successStatus }) : jsonError(result.status, result.error);
}
