import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import { configureDatabaseUrl } from './src/config/database-url';

configureDatabaseUrl();

/** Central Prisma CLI configuration for schema, migrations, and seeding. */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --project tsconfig.seed.json prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
