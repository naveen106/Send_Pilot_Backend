/**
 * Shared pure utility functions used across services.
 * No business logic, no DB calls — pure computation only.
 */

/**
 * Parses a JSON string into a typed array.
 * Falls back to an empty array on invalid/missing input.
 */
export function parseJsonArray<T>(json: string | null | undefined): T[] {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Returns a random integer delay (ms) between min and max (inclusive).
 * Used by interval-mode email sending to mimic human send patterns.
 */
export function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Resolves after `ms` milliseconds — awaitable sleep. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strips newline characters from a string to prevent log injection (CWE-117).
 * Always apply to user-supplied values before logging.
 */
export function sanitizeLog(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}
