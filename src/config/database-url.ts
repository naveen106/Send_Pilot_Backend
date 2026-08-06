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

  // Keep the pool below the database plan's connection ceiling and allow
  // queued requests a little longer during bursts of campaign activity.
  const connectionLimit = process.env.PRISMA_CONNECTION_LIMIT || '4';
  const poolTimeout = process.env.PRISMA_POOL_TIMEOUT || '15';

  const addPoolOptions = (url: string) => {
    const parsed = new URL(url);
    parsed.searchParams.set('connection_limit', connectionLimit);
    parsed.searchParams.set('pool_timeout', poolTimeout);
    return parsed.toString();
  };

  // Prefer separated fields when they are configured.  
  if (host && database && username && password) {
    return addPoolOptions(`mysql://${encodeURIComponent(username!)}:${encodeURIComponent(password!)}`
      + `@${host}:${port}/${encodeURIComponent(database!)}`
      + `?ssl-mode=${encodeURIComponent(sslMode)}`);
  }

  //connect to local db through DATABASE_URL if previous if{} didn't execute
  if (process.env.DATABASE_URL) {
    return addPoolOptions(process.env.DATABASE_URL);
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
