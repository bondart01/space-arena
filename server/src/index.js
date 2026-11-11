
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

import { config } from './config.js';
import { RoomManager } from './room-manager.js';
import { setupWebSocket } from './websocket.js';
import { MatchLogger } from './match-logger.js';

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
// МЕНЕДЖЕР КІМНАТ ТА ЖУРНАЛЮВАННЯ
// ========================================

const roomManager = new RoomManager();
const matchLogger = new MatchLogger(config.logDir);

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
    console.log(
      `[Rooms] Default room already exists: ${existingRoom.name}`,
    );
    return;
  }

  const room = roomManager.createRoom(
    DEFAULT_ROOM_NAME,
    DEFAULT_ROOM_MAX_PLAYERS,
  );

  console.log(
    `[Rooms] Default room created: ${room.name}`,
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
// РОЗДАЧА СТАТИЧНИХ ФАЙЛІВ КЛІЄНТА
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

  // Захист від небезпечних шляхів.
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

    console.error(
      '[Static] Error:',
      error.message,
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
    // ПЕРЕВІРКА СТАНУ СЕРВЕРА
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
      });
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

        const room = roomManager.createRoom(
          name.trim(),
          maxPlayers,
        );

        sendJson(res, 201, {
          room: room.toJSON(),
        });
      } catch (error) {
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
);

// ========================================
// ОБРОБКА ПОМИЛОК
// ========================================

server.on('error', (error) => {
  console.error(
    '[HTTP] Server error:',
    error.message,
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
    console.log(
      'Space Arena server started',
    );

    console.log(
      `HTTP: http://${config.host}:${config.port}`,
    );

    console.log(
      `Static files: ${clientDist}`,
    );

    console.log(
      `Logs: ${config.logDir}`,
    );

    console.log('WebSocket: /ws');

    console.log(
      `[Rooms] Available: ${roomManager.listRooms().length}`,
    );
  },
);

// ========================================
// КОРЕКТНЕ ЗАВЕРШЕННЯ РОБОТИ
// ========================================

function shutdown() {
  console.log(
    '[Server] Shutting down...',
  );

  wss.close();

  server.close(() => {
    console.log(
      '[Server] HTTP server closed',
    );
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
