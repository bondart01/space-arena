import path from 'node:path';
import { z } from 'zod';
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_DIR: z.string().trim().min(1).refine((s) => !s.includes('\0')).default('./logs'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
});
const env = envSchema.parse(process.env);
export const config = Object.freeze({port: env.PORT, logDir: path.resolve(env.LOG_DIR), host: env.HOST});
