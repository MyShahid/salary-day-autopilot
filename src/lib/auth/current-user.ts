import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "./session";

export type CurrentUser = { id: string; email: string };

/**
 * The logged-in user, or null. The user id comes only from the signed session
 * cookie, never from the client. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
});
