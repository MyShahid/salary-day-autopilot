// Shared result shape for server functions, so API routes (HTTP status) and
// server actions (plain message) can both use them.

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: 400 | 401 | 404 | 500; error: string };

export const unauthorized = { ok: false, status: 401, error: "You need to log in first." } as const;

export const fail = (status: 400 | 404 | 500, error: string) => ({ ok: false, status, error }) as const;
