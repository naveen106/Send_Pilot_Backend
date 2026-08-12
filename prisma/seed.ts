/**
 * Seed script — creates the initial admin account on first setup.
 * Credentials are read from environment variables.
 *
 * Runs automatically after `npm run prisma:migrate`.
 * To re-run manually: npm run seed
 */
import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { createPrismaAdapter } from '../src/config/prisma-adapter';

const prisma = new PrismaClient({ adapter: createPrismaAdapter() });

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!email) {
    throw new Error('ADMIN_EMAIL must be set in .env');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin account ready: ${email}`);
    return;
  }

  if (!configuredPassword) {
    throw new Error('ADMIN_PASSWORD must be set in .env');
  }

  const password = configuredPassword;
  if(password === undefined || password.length < 8){
    throw new Error('ADMIN_PASSWORD must be set in .env and at least 8 characters long');
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, password: hashed, name, role: 'ADMIN' },
  });

  console.log(`Admin account created: ${email}`);
  console.log(`ADMIN LOGIN — email: ${email} | password: ${password}`);
  console.log('Change the admin password after the first login.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
