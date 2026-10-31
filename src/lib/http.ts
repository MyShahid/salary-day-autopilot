import { NextResponse } from "next/server";

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export const unauthorized = () => jsonError(401, "You need to log in first.");

// Use for records that don't exist or belong to another user, so ownership is never revealed.
export const notFound = () => jsonError(404, "We couldn't find that.");
