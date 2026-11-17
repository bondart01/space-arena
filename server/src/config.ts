import path from 'node:path';
import { z } from 'zod';

/** Validated server environment configuration. */
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_DIR: z.string().trim().min(1).refine((value) => !value.includes('\0')).default('./logs'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
});

export type ServerEnv = z.infer<typeof envSchema>;
export type ServerConfig = Readonly<{
  port: number;
  logDir: string;
  host: string;
}>;

export function parseServerEnv(value: unknown): ServerEnv {
  return envSchema.parse(value);
}

const env = parseServerEnv(process.env);
export const config: ServerConfig = Object.freeze({
  port: env.PORT,
  logDir: path.resolve(env.LOG_DIR),
  host: env.HOST,
});
