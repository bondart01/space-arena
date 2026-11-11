
import path from 'node:path';

function parsePort(value) {
  const port = Number(value);

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      'PORT must be an integer between 1 and 65535',
    );
  }

  return port;
}

function parseLogDir(value) {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error('LOG_DIR must not be empty');
  }

  if (value.includes('\0')) {
    throw new Error('LOG_DIR contains invalid characters');
  }

  return path.resolve(value);
}

export const config = Object.freeze({
  port: parsePort(process.env.PORT ?? '3000'),
  logDir: parseLogDir(process.env.LOG_DIR ?? './logs'),
  host: process.env.HOST ?? '127.0.0.1',
});
