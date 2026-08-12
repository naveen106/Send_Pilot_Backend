import { Response } from 'express';

/** Reads a single route parameter in a way compatible with Express 5 types. */
export function getRouteId(params: Record<string, string | string[] | undefined>, name = 'id'): number {
  const value = params[name];
  const raw = Array.isArray(value) ? value[0] : value;
  const id = Number.parseInt(raw ?? '', 10);

  if (!Number.isInteger(id) || id < 1) {
    throw new Error(`Invalid ${name}`);
  }

  return id;
}

/**
 * Sends API responses in the format used throughout the application.
 * Keeping the shape in one place prevents controllers from drifting apart.
 */
export function sendSuccess<T>(res: Response, data?: T, message?: string, status = 200): void {
  res.status(status).json({
    success: true,
    ...(message ? { message } : {}),
    ...(data === undefined ? {} : { data }),
  });
}

/** Sends a consistent client-facing error response. */
export function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, message });
}

/** Safely converts an unknown caught value into a client-facing message. */
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Reads pagination parameters while retaining the API's existing defaults.
 * Invalid, missing, and zero-like values fall back to the supplied values.
 */
export function getPagination(query: Record<string, unknown>, defaultLimit: number) {
  const page = Number.parseInt(String(query.page), 10) || 1;
  const limit = Number.parseInt(String(query.limit), 10) || defaultLimit;
  return { page, limit };
}
