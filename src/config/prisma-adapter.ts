// import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { configureDatabaseUrl } from './database-url';

/** Creates the Prisma 7 MySQL/MariaDB driver adapter from the app's database configuration. */
export function createPrismaAdapter(): PrismaMariaDb {
  const databaseUrl = new URL(configureDatabaseUrl());
  const database = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ''));
  const poolTimeoutSeconds = Number(databaseUrl.searchParams.get('pool_timeout') || 30);
  const sslMode = process.env.DB_SSL_MODE?.trim().toUpperCase() || 'REQUIRED';

  return new PrismaMariaDb({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database,
    connectionLimit: Number(databaseUrl.searchParams.get('connection_limit') || 4),
    // Prisma's pool_timeout URL option is not automatically forwarded to the
    // driver adapter. MariaDB expects pool acquisition time in milliseconds.
    acquireTimeout: poolTimeoutSeconds * 1000,
    connectTimeout: poolTimeoutSeconds * 1000,
    ssl: sslMode !== 'DISABLED',
  });
}
