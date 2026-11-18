
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',

  base: {
    service: 'space-arena-server',
  },

  timestamp: pino.stdTimeFunctions.isoTime,

  formatters: {
    level(label) {
      return {
        level: label,
      };
    },
  },

  redact: {
    paths: [
      'password',
      'token',
      'authorization',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
});

export function createRoomLogger(roomId) {
  return logger.child({
    roomId,
  });
}

export function createPlayerLogger(roomId, playerId) {
  return logger.child({
    roomId,
    playerId,
  });
}
