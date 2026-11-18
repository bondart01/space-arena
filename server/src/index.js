
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

import { config } from './config.ts';
import { RoomManager } from './room-manager.ts';
import { setupWebSocket } from './websocket.js';
import { MatchLogger } from './match-logger.js';
import { ServerMetrics } from './metrics.js';
import { logger } from './logger.js';

// ========================================
// ШЛЯХ ДО ЗІБРАНОГО КЛІЄНТА
// ========================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientDist = path.resolve(
  __dirname,
  '../../client/dist',
);

// ========================================
// МЕНЕДЖЕР КІМНАТ, ЛОГІВ ТА МЕТРИК
// ========================================

const roomManager = new RoomManager();
const matchLogger = new MatchLogger(config.logDir);
const metrics = new ServerMetrics();

const loggedEvents = [
  'roomCreated',
  'roomDeleted',
  'playerJoined',
  'playerLeft',
  'chat',
];

for (const eventType of loggedEvents) {
  roomManager.on(eventType, (data) => {
    matchLogger.log({
      type: eventType,
      ...data,
    });

    // Не записуємо текст приватних повідомлень
    // у загальний журнал сервера.
    const logData = { ...data };

    if (eventType === 'chat') {
      delete logData.message;
    }

    logger.info(
      {
        event: eventType,
        ...logData,
      },
      `Room event: ${eventType}`,
    );
  });
}

// ========================================
// АВТОМАТИЧНЕ СТВОРЕННЯ КІМНАТИ
// ========================================

const DEFAULT_ROOM_NAME = 'Lab 5 Battle';
const DEFAULT_ROOM_MAX_PLAYERS = 2;

function ensureDefaultRoom() {
  const existingRoom = roomManager
    .listRooms()
    .find(
      (room) => room.name === DEFAULT_ROOM_NAME,
    );

  if (existingRoom) {
    logger.info(
      {
        event: 'default_room_exists',
        roomId: existingRoom.id,
        roomName: existingRoom.name,
      },
      'Default room already exists',
    );
    return;
  }

  const room = roomManager.createRoom(
    DEFAULT_ROOM_NAME,
    DEFAULT_ROOM_MAX_PLAYERS,
  );

  logger.info(
    {
      event: 'default_room_created',
      roomId: room.id,
      roomName: room.name,
    },
    'Default room created',
  );
}

ensureDefaultRoom();

// ========================================
// MIME-ТИПИ СТАТИЧНИХ ФАЙЛІВ
// ========================================

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// ========================================
// JSON-ВІДПОВІДІ
// ========================================

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });

  res.end(JSON.stringify(data));
}

// ========================================
// ЧИТАННЯ JSON ІЗ ЗАПИТУ
// ========================================

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > 16 * 1024) {
      const error = new Error(
        'Request body is too large',
      );

      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(
      Buffer.concat(chunks).toString('utf8'),
    );
  } catch {
    const error = new Error('Invalid JSON');
    error.statusCode = 400;
    throw error;
  }
}

// ========================================
// РОЗДАЧА СТАТИЧНИХ ФАЙЛІВ
// ========================================

async function serveStatic(req, res, pathname) {
  if (
    req.method !== 'GET' &&
    req.method !== 'HEAD'
  ) {
    sendJson(res, 405, {
      error: 'Method Not Allowed',
    });
    return;
  }

  let decodedPath;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, {
      error: 'Invalid URL encoding',
    });
    return;
  }

  const segments = decodedPath.split('/');

  if (
    decodedPath.includes('\0') ||
    decodedPath.includes('\\') ||
    segments.includes('..') ||
    segments.includes('.')
  ) {
    sendJson(res, 403, {
      error: 'Forbidden path',
    });
    return;
  }

  const requestedPath =
    decodedPath === '/'
      ? '/index.html'
      : decodedPath;

  const filePath = path.resolve(
    clientDist,
    `.${requestedPath}`,
  );

  const relative = path.relative(
    clientDist,
    filePath,
  );

  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    sendJson(res, 403, {
      error: 'Access denied',
    });
    return;
  }

  try {
    const stats = await fs.promises.stat(filePath);

    if (!stats.isFile()) {
      sendJson(res, 404, {
        error: 'File not found',
      });
      return;
    }

    const realDist =
      await fs.promises.realpath(clientDist);

    const realFile =
      await fs.promises.realpath(filePath);

    const realRelative = path.relative(
      realDist,
      realFile,
    );

    if (
      realRelative.startsWith('..') ||
      path.isAbsolute(realRelative)
    ) {
      sendJson(res, 403, {
        error: 'Access denied',
      });
      return;
    }

    const extension = path
      .extname(filePath)
      .toLowerCase();

    res.writeHead(200, {
      'Content-Type':
        mimeTypes[extension] ??
        'application/octet-stream',
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    await pipeline(
      fs.createReadStream(filePath),
      res,
    );
  } catch (error) {
    if (
      error.code === 'ENOENT' ||
      error.code === 'ENOTDIR'
    ) {
      if (!res.headersSent) {
        sendJson(res, 404, {
          error: 'File not found',
        });
      }
      return;
    }

    logger.error(
      {
        event: 'static_file_error',
        err: error,
      },
      'Static file serving failed',
    );

    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'Internal Server Error',
      });
    } else {
      res.destroy();
    }
  }
}

// ========================================
// СТАН СЕРВЕРА
// ========================================

let isShuttingDown = false;

// ========================================
// HTTP-СЕРВЕР
// ========================================

const server = http.createServer(
  async (req, res) => {
    let url;

    try {
      url = new URL(
        req.url,
        'http://localhost',
      );
    } catch {
      sendJson(res, 400, {
        error: 'Invalid URL',
      });
      return;
    }

    // ------------------------------------
    // HEALTH CHECK
    // ------------------------------------

    if (
      req.method === 'GET' &&
      url.pathname === '/health'
    ) {
      sendJson(res, 200, {
        status: 'ok',
        service: 'space-arena-server',
        uptime: Math.round(
          process.uptime(),
        ),
        gitSha: process.env.GIT_SHA ?? 'development',
      });
      return;
    }

    // ------------------------------------
    // READINESS CHECK
    // ------------------------------------

    if (
      req.method === 'GET' &&
      url.pathname === '/ready'
    ) {
      sendJson(
        res,
        isShuttingDown ? 503 : 200,
        {
          status: isShuttingDown
            ? 'not_ready'
            : 'ready',
        },
      );
      return;
    }

    // ------------------------------------
    // METRICS
    // ------------------------------------

    if (
      req.method === 'GET' &&
      url.pathname === '/metrics'
    ) {
      sendJson(
        res,
        200,
        metrics.getMetrics(roomManager),
      );
      return;
    }

    // ------------------------------------
    // СПИСОК КІМНАТ
    // ------------------------------------

    if (
      req.method === 'GET' &&
      url.pathname === '/api/rooms'
    ) {
      sendJson(res, 200, {
        rooms: roomManager.listRooms(),
      });
      return;
    }

    // ------------------------------------
    // СТВОРЕННЯ НОВОЇ КІМНАТИ
    // ------------------------------------

    if (
      req.method === 'POST' &&
      url.pathname === '/api/rooms'
    ) {
      try {
        const body = await readJsonBody(req);

        const name = body.name;
        const maxPlayers = body.maxPlayers ?? 2;

        if (
          typeof name !== 'string' ||
          !name.trim() ||
          name.length > 50 ||
          !Number.isInteger(maxPlayers) ||
          maxPlayers < 1 ||
          maxPlayers > 16
        ) {
          sendJson(res, 400, {
            error: 'Invalid room configuration',
          });
          return;
        }

        if (isShuttingDown) {
          sendJson(res, 503, {
            error: 'Server is shutting down',
          });
          return;
        }

        if (
          roomManager.listRooms().length >=
          config.maxRooms
        ) {
          sendJson(res, 429, {
            error: 'Room limit reached',
          });
          return;
        }

        const room = roomManager.createRoom(
          name.trim(),
          maxPlayers,
        );

        sendJson(res, 201, {
          room: room.toJSON(),
        });
      } catch (error) {
        logger.warn(
          {
            event: 'room_creation_failed',
            error: error.message,
          },
          'Failed to create room',
        );

        sendJson(
          res,
          error.statusCode ?? 400,
          {
            error: error.message,
          },
        );
      }

      return;
    }

    // ------------------------------------
    // СТАТИЧНІ ФАЙЛИ SPACE ARENA
    // ------------------------------------

    await serveStatic(
      req,
      res,
      url.pathname,
    );
  },
);

// ========================================
// WEBSOCKET-СЕРВЕР
// ========================================

const wss = setupWebSocket(
  server,
  roomManager,
  metrics,
);

// ========================================
// ОБРОБКА ПОМИЛОК
// ========================================

server.on('error', (error) => {
  logger.error(
    {
      event: 'http_server_error',
      err: error,
    },
    'HTTP server error',
  );

  process.exitCode = 1;
});

// ========================================
// ЗАПУСК СЕРВЕРА
// ========================================

server.listen(
  config.port,
  config.host,
  () => {
    logger.info(
      {
        event: 'server_started',
        host: config.host,
        port: config.port,
        rooms: roomManager.listRooms().length,
        clientDist,
        logDir: config.logDir,
        websocketPath: '/ws',
        metricsPath: '/metrics',
      },
      'Space Arena server started',
    );
  },
);

// ========================================
// КОРЕКТНЕ ЗАВЕРШЕННЯ РОБОТИ
// ========================================

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  wss.beginShutdown();

  logger.info(
    {
      event: 'shutdown_started',
    },
    'Server shutting down',
  );

  const forceExitTimer = setTimeout(() => {
    logger.error(
      {
        event: 'shutdown_timeout',
      },
      'Shutdown timeout',
    );

    process.exit(1);
  }, 9000);

  try {
    // Зупиняємо ігрові цикли.
    for (const room of roomManager.rooms.values()) {
      room.gameLoop.stop();
    }

    // Повідомляємо гравців про завершення.
    for (const socket of [...wss.clients]) {
      if (socket.readyState === 1) {
        try {
          socket.send(
            JSON.stringify({
              type: 'shutdown',
              reason: 'Server is shutting down',
            }),
            (error) => {
              if (error) {
                logger.warn(
                  {
                    event: 'shutdown_notification_failed',
                    error: error.message,
                  },
                  'Shutdown notification failed',
                );
              }

              if (socket.readyState === 1) {
                socket.close(
                  1001,
                  'Server shutdown',
                );
              }
            },
          );
        } catch (error) {
          logger.warn(
            {
              event: 'shutdown_socket_error',
              error: error.message,
            },
            'WebSocket shutdown failed',
          );

          socket.terminate();
        }
      }
    }

    // Даємо клієнтам час отримати повідомлення.
    await new Promise(
      (resolve) => setTimeout(resolve, 500),
    );

    // Завершуємо завислі WebSocket-з'єднання.
    for (const socket of wss.clients) {
      if (socket.readyState !== 3) {
        socket.terminate();
      }
    }

    await new Promise((resolve, reject) => {
      wss.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Закриваємо HTTP-сервер.
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      server.closeIdleConnections();
    });

    // Завершуємо запис журналу матчів.
    await matchLogger.close();

    clearTimeout(forceExitTimer);

    logger.info(
      {
        event: 'shutdown_complete',
      },
      'Server shutdown complete',
    );

    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);

    logger.error(
      {
        event: 'shutdown_failed',
        err: error,
      },
      'Server shutdown failed',
    );

    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
