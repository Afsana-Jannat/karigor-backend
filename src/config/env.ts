import 'dotenv/config';
import { z } from 'zod';

// Validate environment variables once, at startup.
// Only DATABASE_URL is required for now. Other keys are optional here and
// get checked by the feature that needs them (auth, uploads, AI, payments).
const booleanString = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().default('http://localhost:3000'),
  BACKEND_URL: z.string().default('http://localhost:5000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  DEMO_MODE: booleanString('true'),
  AI_MOCK: booleanString('false'),

  REDIS_USER: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().positive().optional(),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters').optional(),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').optional(),
  JWT_ACCESS_EXPIRES_IN: z.string().default('1d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Added when the AI feature is built. Placeholder values are fine until then.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
}

export const env = parsed.data;

// Neon pooled hosts contain "-pooler". The app should use the pooled URL and
// Prisma migrations the direct one. Warn if they look swapped.
const isPooled = (url?: string) => !!url && /-pooler[.-]/.test(url);
if (env.DIRECT_URL && isPooled(env.DIRECT_URL) && !isPooled(env.DATABASE_URL)) {
  console.warn(
    '[env] DATABASE_URL looks like a direct Neon URL and DIRECT_URL looks pooled. ' +
      'They are probably swapped: DATABASE_URL should be the pooled (-pooler) one.'
  );
}