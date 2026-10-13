import { createClient } from 'redis';
import { env } from '../config/env.js';

if (!env.REDIS_HOST || !env.REDIS_PORT) {
  throw new Error('REDIS_HOST and REDIS_PORT must be configured');
}

export const redis = createClient({
  username: env.REDIS_USER,
  password: env.REDIS_PASSWORD,
  socket: {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    reconnectStrategy(retries) {
      if (retries > 5) {
        return new Error('Redis reconnect limit exceeded');
      }

      return Math.min(retries * 500, 3000);
    },
  },
});

redis.on('error', (error) => {
  console.error('[Redis] Client error:', error.message);
});
