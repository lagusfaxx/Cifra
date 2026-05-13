import { createServer } from 'node:http';
import { initCrypto } from '@cifra/crypto';
import { createApp } from './server.js';
import { getEnv } from './lib/env.js';
import { logger } from './lib/logger.js';
import { disconnectDb, prisma } from './lib/db.js';
import { disconnectRedis } from './lib/redis.js';
import { ensureBucket } from './lib/minio.js';
import { startCleanupJobs } from './jobs/cleanup.js';

async function main(): Promise<void> {
  const env = getEnv();
  await initCrypto();
  await prisma.$connect();
  await ensureBucket();
  startCleanupJobs();

  const app = createApp();
  const server = createServer(app);

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'cifra-api listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    server.close();
    await disconnectDb();
    await disconnectRedis();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'api boot failed');
  process.exit(1);
});
