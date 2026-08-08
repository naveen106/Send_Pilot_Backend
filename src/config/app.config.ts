/**
 * Application behavior defaults.
 *
 * These values are not secrets. The global email limit is configured in `.env`
 * so it can be changed without modifying application code.
 */
function readGlobalDailyLimit() {
  const configuredLimit = process.env.MAX_DAILY_EMAILS;
  const limit = Number(configuredLimit);
  if (!configuredLimit || !Number.isInteger(limit) || limit < 1) {
    throw new Error('MAX_DAILY_EMAILS must be configured as a positive whole number');
  }
  return limit;
}

export const appConfig = {
  email: {
    /** Maximum number of messages all campaigns may send in a rolling 24-hour period. */
    globalDailyLimit: readGlobalDailyLimit(),

    /** Inclusive lower bound for interval-mode delays, in milliseconds. */
    randomDelayMinMs: 60_000,

    /** Inclusive upper bound for interval-mode delays, in milliseconds. */
    randomDelayMaxMs: 600_000,
  },
} as const;
