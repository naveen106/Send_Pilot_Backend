/**
 * Application behavior defaults.
 *
 * These values are not secrets and are intentionally kept in source control
 * so deployments use the same safe email-sending behavior by default. Secrets
 * and environment-specific connection settings remain in `.env`.
 */
export const appConfig = {
  email: {
    /** Maximum number of messages one campaign may send in a day. */
    dailyLimit: 200,

    /** Number of messages sent concurrently in batch mode. */
    batchSize: 10,

    /** Inclusive lower bound for interval-mode delays, in milliseconds. */
    randomDelayMinMs: 60_000,

    /** Inclusive upper bound for interval-mode delays, in milliseconds. */
    randomDelayMaxMs: 600_000,
  },
} as const;
