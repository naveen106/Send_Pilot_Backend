/**
 * Builds the MySQL URL used by Prisma from separate environment variables.
 * DATABASE_URL remains supported as an explicit override for hosted platforms.
 */
export function getDatabaseUrl(): string {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || '3306';
  const database = process.env.DB_NAME;
  const username = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const sslMode = process.env.DB_SSL_MODE || 'REQUIRED';

  // Prefer separated fields when they are configured. This prevents an old
  // DATABASE_URL from silently overriding the current database settings.
  if (![host, database, username, password].some((value) => !value)) {
    return `mysql://${encodeURIComponent(username!)}:${encodeURIComponent(password!)}`
      + `@${host}:${port}/${encodeURIComponent(database!)}`
      + `?ssl-mode=${encodeURIComponent(sslMode)}`;
  }

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const missing = [
    ['DB_HOST', host],
    ['DB_NAME', database],
    ['DB_USER', username],
    ['DB_PASSWORD', password],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing database environment variable(s): ${missing.join(', ')}`);
  }

  throw new Error('Database connection settings are not configured');
}

export function configureDatabaseUrl(): string {
  const databaseUrl = getDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;
  return databaseUrl;
}
