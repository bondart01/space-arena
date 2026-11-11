
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

import { config } from './config.js';
import { RoomManager } from './room-manager.js';
import { setupWebSocket } from './websocket.js';
import { MatchLogger } from './match-logger.js';

// Absolute path to the built client
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../../client/dist');

const roomManager = new RoomManager();
const matchLogger = new MatchLogger(config.logDir);

// Match events saved as NDJSON
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

// MIME types for static resources
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

// Send a JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });

  res.end(JSON.stringify(data));
}

// Read a JSON request body with a size limit
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > 16 * 1024) {
      const error = new Error('Request body is too large');
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

// Safely serve a file from client/dist
async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
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

  // Reject path traversal and Windows-style separators
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

  // Ensure the resolved file remains inside client/dist
  const relative = path.relative(clientDist, filePath);

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

    // Prevent symlink-based escapes from client/dist
    const realDist = await fs.promises.realpath(clientDist);
    const realFile = await fs.promises.realpath(filePath);
    const realRelative = path.relative(realDist, realFile);

    if (
      realRelative.startsWith('..') ||
      path.isAbsolute(realRelative)
    ) {
      sendJson(res, 403, {
        error: 'Access denied',
      });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();

    res.writeHead(200, {
      'Content-Type':
        mimeTypes[extension] ?? 'application/octet-stream',
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
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      if (!res.headersSent) {
        sendJson(res, 404, {
          error: 'File not found',
        });
      }
      return;
    }

    console.error('[Static] Error:', error.message);

    if (!res.headersSent) {
      sendJson(res, 500, {
        error: 'Internal Server Error',
      });
    } else {
      res.destroy();
    }
  }
}

// HTTP server
const server = http.createServer(async (req, res) => {
  let url;

  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    sendJson(res, 400, {
      error: 'Invalid URL',
    });
    return;
  }

  // Health check
  if (
    req.method === 'GET' &&
    url.pathname === '/health'
  ) {
    sendJson(res, 200, {
      status: 'ok',
      service: 'space-arena-server',
      uptime: Math.round(process.uptime()),
    });
    return;
  }

  // List rooms
  if (
    req.method === 'GET' &&
    url.pathname === '/api/rooms'
  ) {
    sendJson(res, 200, {
      rooms: roomManager.listRooms(),
    });
    return;
  }

  // Create a room
  if (
    req.method === 'POST' &&
    url.pathname === '/api/rooms'
  ) {
    try {
      const body = await readJsonBody(req);

      if (
        body === null ||
        typeof body !== 'object' ||
        Array.isArray(body)
      ) {
        sendJson(res, 400, {
          error: 'Request body must be an object',
        });
        return;
      }

      const room = roomManager.createRoom(
        body.name,
        body.maxPlayers ?? 8,
      );

      sendJson(res, 201, {
        room: room.toJSON(),
      });
    } catch (error) {
      sendJson(res, error.statusCode ?? 400, {
        error: error.message,
      });
    }
    return;
  }

  // Unknown API routes must not return static files
  if (
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/')
  ) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      // Allow client assets such as /api/rooms.json
      if (url.pathname.endsWith('.json')) {
        await serveStatic(req, res, url.pathname);
        return;
      }
    }

    sendJson(res, 404, {
      error: 'API route not found',
    });
    return;
  }

  // Serve the built client
  await serveStatic(req, res, url.pathname);
});

// WebSocket server
const wss = setupWebSocket(server, roomManager);

server.on('error', (error) => {
  console.error('[HTTP] Server error:', error.message);
  process.exitCode = 1;
});

server.listen(config.port, config.host, () => {
  console.log('Space Arena server started');
  console.log(`HTTP: http://${config.host}:${config.port}`);
  console.log(`Static files: ${clientDist}`);
  console.log(`Logs: ${config.logDir}`);
  console.log('WebSocket: /ws');
});

// Graceful shutdown
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;

  console.log(`\nReceived ${signal}. Shutting down...`);

  const httpClosed = new Promise((resolve) => {
    server.close((error) => {
      if (error) {
        console.error('[HTTP] Close error:', error.message);
      }
      resolve();
    });
  });

  for (const socket of wss.clients) {
    socket.terminate();
  }

  try {
    await httpClosed;
    await matchLogger.close();

    console.log('Match logs saved successfully');
    process.exitCode = 0;
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
