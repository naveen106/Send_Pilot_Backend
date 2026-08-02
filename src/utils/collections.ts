/**
 * Removes empty and duplicate strings using a case-insensitive comparison.
 * The first submitted spelling is retained for display and email delivery.
 */
export function uniqueTrimmedStrings(values: string[]): string[] {
  const seen = new Set<string>();

  return values.reduce<string[]>((uniqueValues, value) => {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();

    if (!trimmed || seen.has(key)) return uniqueValues;

    seen.add(key);
    uniqueValues.push(trimmed);
    return uniqueValues;
  }, []);
}

/**
 * Appends only new values to an existing list without changing the stored list.
 * This is useful when existing persisted data must be preserved exactly.
 */
export function appendUniqueTrimmedStrings(existing: string[], additions: string[]): string[] {
  const seen = new Set(existing.map((value) => value.toLowerCase()));
  const merged = [...existing];

  for (const value of additions) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push(value);
  }

  return merged;
}

/** Converts arbitrary request IDs into a unique list of positive integer IDs. */
export function uniquePositiveIds(values: unknown[]): number[] {
  return [...new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}
