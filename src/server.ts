import { env } from './config/env.js';
import app from './app.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

const PORT = env.PORT;

async function main() {
  try {
    // With the pg adapter, $connect() alone does not prove the database is
    // reachable, so run a real query. A wrong DATABASE_URL now stops startup.
    await prisma.$queryRaw`SELECT 1`;
    console.log('Connected to the database successfully.');

    if (!redis.isOpen) {
      await redis.connect();
    }
    console.log('Connected to Redis successfully.');

    const server = app.listen(PORT, () => {
      console.log(`Karigor server is running on port ${PORT}`);
    });

    // Close the server and the database pool cleanly (Ctrl+C or a host restart).
    const shutdown = (signal: string) => {
      console.log(`${signal} received, shutting down...`);
      server.close(async () => {
        if (redis.isOpen) {
          await redis.quit();
        }
        await prisma.$disconnect();
        process.exit(0);
      });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error) {
    console.error('Error starting the server:', error);
    if (redis.isOpen) {
      await redis.quit().catch(() => {});
    }
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
