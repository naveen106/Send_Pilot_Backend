import { Prisma, PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { createPrismaAdapter } from './prisma-adapter';

type PrismaOptionsWithLogging = Prisma.PrismaClientOptions & {
  log: Prisma.LogDefinition[];
};

const prisma: PrismaClient<PrismaOptionsWithLogging> = new PrismaClient({
  adapter: createPrismaAdapter(),
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'warn' },
  ] as Prisma.LogDefinition[],
});

prisma.$on('error', (e) => logger.error(`Prisma error: ${e.message}`));
prisma.$on('warn', (e) => logger.warn(`Prisma warn: ${e.message}`));

export async function validateDatabaseConnection(): Promise<void> {
  try {
    await prisma.$connect();
    logger.success('Database connection established successfully');
  } catch (error) {
    logger.error('Failed to connect to database', error);
    throw error;
  }
}

export default prisma;
