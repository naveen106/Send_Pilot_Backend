/**
 * Seed script — creates initial privileged users that can't self-register.
 *
 * To add more ADMIN/MANAGER accounts:
 *   1. Add an entry to SEED_USERS below and re-run: npm run seed
 *
 * To promote an existing user:
 *   - Log in as ADMIN → Users page → change role via the dropdown
 *
 * Run: npm run seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const SEED_USERS = [
  { email: 'admin@test.com',   password: 'admin123',   name: 'Test Admin',   role: 'ADMIN'   as const },
  { email: 'manager@test.com', password: 'manager123', name: 'Test Manager', role: 'MANAGER' as const },
];

async function main() {
  for (const u of SEED_USERS) {
    const hashed = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, password: hashed, name: u.name, role: u.role },
    });
    console.log(`Seeded: ${u.email} [${u.role}]`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
