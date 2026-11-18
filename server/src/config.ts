
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  LOG_DIR: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !value.includes('\0'))
    .default('./logs'),

  HOST: z.string().trim().min(1).default('127.0.0.1'),

  ALLOWED_ORIGINS: z
    .string()
    .default(
      'http://localhost:3000,' +
        'http://127.0.0.1:3000,' +
        'http://localhost:5175,' +
        'http://127.0.0.1:5175',
    ),

  MAX_CONNECTIONS_PER_IP: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(5),

  MAX_ROOMS: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(20),

  MAX_PLAYERS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(100),
});

export type ServerEnv = z.infer<typeof envSchema>;

export type ServerConfig = Readonly<{
  port: number;
  logDir: string;
  host: string;
  allowedOrigins: readonly string[];
  maxConnectionsPerIp: number;
  maxRooms: number;
  maxPlayers: number;
}>;

export function parseServerEnv(value: unknown): ServerEnv {
  return envSchema.parse(value);
}

const env = parseServerEnv(process.env);

const allowedOrigins = env.ALLOWED_ORIGINS
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
    const url = new URL(origin);

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin
    ) {
      throw new Error(`Invalid allowed origin: ${origin}`);
    }

    return url.origin;
  });

if (allowedOrigins.length === 0) {
  throw new Error('ALLOWED_ORIGINS cannot be empty');
}

export const config: ServerConfig = Object.freeze({
  port: env.PORT,
  logDir: path.resolve(env.LOG_DIR),
  host: env.HOST,
  allowedOrigins: Object.freeze([...new Set(allowedOrigins)]),
  maxConnectionsPerIp: env.MAX_CONNECTIONS_PER_IP,
  maxRooms: env.MAX_ROOMS,
  maxPlayers: env.MAX_PLAYERS,
});
