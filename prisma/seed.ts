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

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';

  if (!email) {
    throw new Error('ADMIN_EMAIL must be set in .env');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && !resetPassword) {
    console.log(`Admin account ready: ${email}`);
    return;
  }

  const password = resetPassword || !configuredPassword
    ? crypto.randomBytes(18).toString('base64url')
    : configuredPassword;
  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: resetPassword
      ? { password: hashed, role: 'ADMIN', isActive: true, resetToken: null, resetTokenExpiry: null }
      : {},
    create: { email, password: hashed, name, role: 'ADMIN' },
  });

  console.log(`Admin account ${existing ? 'reset' : 'created'}: ${email}`);
  console.log(`ADMIN LOGIN — email: ${email} | password: ${password}`);
  console.log('Change the admin password after the first login.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
