/**
 * Validates deployment-critical settings once during application startup.
 * Optional integrations such as SMTP are validated when they are used.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret === 'secret' || secret === 'replace_with_a_long_random_secret') {
    throw new Error('JWT_SECRET must be configured with a long, random value');
  }
  return secret;
}

export function validateEnvironment(): void {
  const databaseConfigured = Boolean(
    process.env.DATABASE_URL ||
      (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_PORT)
  );

  if (!databaseConfigured) {
    throw new Error('Database configuration is missing. Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD/DB_PORT');
  }

  getJwtSecret();
}
