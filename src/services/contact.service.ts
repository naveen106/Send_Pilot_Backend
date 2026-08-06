import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import prisma from '../config/database';
import logger from '../utils/logger';
import { uniqueTrimmedStrings } from '../utils/collections';

/** The minimum database surface required to create contacts. */
type ContactWriter = Pick<PrismaClient, 'contact'>;

async function parseRecords(buffer: Buffer, mimetype: string): Promise<{ email: string; name?: string }[]> {
  if (mimetype === 'text/csv' || mimetype === 'application/csv') {
    return parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
  }

  const workbook = new ExcelJS.Workbook();
  // ExcelJS currently types its Buffer parameter against an older Node Buffer
  // declaration; the runtime accepts the request buffer directly.
  await workbook.xlsx.load(buffer as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) return [];

  const headerRow = worksheet.getRow(1);
  const headers = Array.from({ length: headerRow.cellCount }, (_, index) =>
    headerRow.getCell(index + 1).text.trim().toLowerCase()
  );

  return Array.from({ length: worksheet.rowCount - 1 }, (_, index) => {
    const row = worksheet.getRow(index + 2);
    const values = headers.map((_, columnIndex) => row.getCell(columnIndex + 1).text.trim());
    const record = Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]]));
    return { email: String(record.email || '').toLowerCase(), name: record.name || undefined };
  });
}

/**
 * Creates contacts for email recipients that are not already in the address book.
 * `skipDuplicates` makes the operation safe for repeated campaign recipients and
 * concurrent requests. It accepts both the regular Prisma client and a transaction.
 */
export async function createMissingContacts( database: ContactWriter,  emails: string[]): Promise<number> {
  const uniqueEmails = uniqueTrimmedStrings(emails);
  if (uniqueEmails.length === 0) return 0;

  const { count } = await database.contact.createMany({
    data: uniqueEmails.map((email) => ({ email })),
    skipDuplicates: true,
  });

  return count;
}

export async function importContacts(buffer: Buffer, mimetype: string) {
  const records = (await parseRecords(buffer, mimetype)).filter((r) => r.email);

  const unique = new Map<string, { email: string; name?: string }>();
  for (const r of records) {
    if (!unique.has(r.email)) unique.set(r.email, r);
  }

  let imported = 0, skipped = 0;
  for (const contact of unique.values()) {
    try {
      await prisma.contact.upsert({
        where: { email: contact.email },
        update: { name: contact.name },
        create: { email: contact.email, name: contact.name },
      });
      imported++;
    } catch { skipped++; }
  }

  logger.info(`Import: ${imported} imported, ${skipped} skipped`);
  return { imported, skipped, total: records.length, emails: Array.from(unique.keys()) };
}

export async function getContacts(page = 1, limit = 20, search?: string) {
  const skip = (page - 1) * limit;
  const where = search
    ? { OR: [{ email: { contains: search } }, { name: { contains: search } }] }
    : {};

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.contact.count({ where }),
  ]);

  return { contacts, total, page, limit };
}

export async function addContact(email: string, name?: string) {
  const existing = await prisma.contact.findUnique({ where: { email } });
  if (existing) throw new Error('Email already exists');
  return prisma.contact.create({ data: { email, name } });
}

export async function updateContact(id: number, data: { email?: string; name?: string; isActive?: boolean }) {
  return prisma.contact.update({ where: { id }, data });
}

export async function deleteContact(id: number) {
  return prisma.contact.delete({ where: { id } });
}

export async function bulkDeleteContacts(ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
  const { count } = await prisma.contact.deleteMany({ where: { id: { in: uniqueIds } } });
  logger.info(`Bulk deleted ${count} contacts`);
  return { deleted: count };
}


export async function removeDuplicates() {
  const contacts = await prisma.contact.findMany({ orderBy: { createdAt: 'asc' } });
  const seen = new Set<string>();
  const toDelete: number[] = [];

  for (const c of contacts) {
    if (seen.has(c.email)) {
      toDelete.push(c.id);
    } else {
      seen.add(c.email);
    }
  }

  if (toDelete.length > 0) await prisma.contact.deleteMany({ where: { id: { in: toDelete } } });

  logger.info(`Removed ${toDelete.length} duplicate contacts`);
  return { removed: toDelete.length };
}
