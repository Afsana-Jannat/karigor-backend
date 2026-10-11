import { prisma } from '../../../lib/prisma.js';

const TIMEOUT_MS = 3000;

// Returns true if the database answers SELECT 1 within the timeout.
export async function isDatabaseUp(): Promise<boolean> {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    return true;
  } catch {
    return false;
  }
}