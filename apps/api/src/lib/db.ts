import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

declare global {
  // eslint-disable-next-line no-var
  var __cifraPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__cifraPrisma ??
  new PrismaClient({
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

prisma.$on('warn' as never, (e: unknown) => {
  logger.warn({ prisma: e }, 'prisma warning');
});
prisma.$on('error' as never, (e: unknown) => {
  logger.error({ prisma: e }, 'prisma error');
});

if (process.env.NODE_ENV !== 'production') {
  global.__cifraPrisma = prisma;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
