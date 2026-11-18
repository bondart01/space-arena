import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once, EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

import { setupWebSocket } from '../src/websocket.js';

// ========================================
// TEST CONFIGURATION
// ========================================

// Дозволений Origin із конфігурації сервера.
const TEST_ORIGIN = 'http://localhost:3000';

// ========================================
// TEST HELPERS
// ========================================

// Створюємо тестовий менеджер кімнат.
function createTestRoomManager() {
  const roomManager = new EventEmitter();

  // Порожній список кімнат.
  roomManager.rooms = new Map();

  // Тестові підключення не приєднані до кімнати.
  roomManager.getRoom = () => null;

  return roomManager;
}

// Створюємо тестові метрики.
function createTestMetrics() {
  return {
    recordSent: () => {},
    recordReceived: () => {},
  };
}

// ========================================
// WEBSOCKET RATE LIMITING
// ========================================

describe('WebSocket rate limiting', () => {
  it('closes connection after more than 120 messages per second', async () => {
    const server = createServer();

    const roomManager = createTestRoomManager();
    const metrics = createTestMetrics();

    const wss = setupWebSocket(
      server,
      roomManager,
      metrics,
    );

    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');

      const address = server.address();

      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/ws`,
        {
          origin: TEST_ORIGIN,
        },
      );

      await once(socket, 'open');

      const closed = new Promise((resolve, reject) => {
        socket.once('close', (code, reason) => {
          resolve({
            code,
            reason: reason.toString(),
          });
        });

        socket.once('error', reject);
      });

      // Надсилаємо 121 повідомлення.
      // Сервер дозволяє максимум 120 за секунду.
      for (let i = 0; i < 121; i++) {
        socket.send(
          JSON.stringify({
            type: 'ping',
            id: i,
          }),
        );
      }

      const result = await closed;

      expect(result.code).toBe(1008);

      expect(result.reason).toBe(
        'Rate limit exceeded',
      );
    } finally {
      await new Promise((resolve) => {
        wss.close(() => resolve());
      });

      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
  }, 10000);
});

// ========================================
// INVALID JSON
// ========================================

describe('WebSocket invalid messages', () => {
  it('rejects malformed JSON', async () => {
    const server = createServer();

    const roomManager = createTestRoomManager();
    const metrics = createTestMetrics();

    const wss = setupWebSocket(
      server,
      roomManager,
      metrics,
    );

    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');

      const address = server.address();

      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/ws`,
        {
          origin: TEST_ORIGIN,
        },
      );

      await once(socket, 'open');

      const closed = new Promise((resolve, reject) => {
        socket.once('close', (code, reason) => {
          resolve({
            code,
            reason: reason.toString(),
          });
        });

        socket.once('error', reject);
      });

      // Надсилаємо некоректний JSON.
      socket.send('{invalid-json');

      const result = await closed;

      expect(result.code).toBe(1007);

      expect(result.reason).toBe(
        'Invalid JSON',
      );
    } finally {
      await new Promise((resolve) => {
        wss.close(() => resolve());
      });

      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
  }, 10000);
});

// ========================================
// MESSAGE VALIDATION
// ========================================

describe('WebSocket message validation', () => {
  it('rejects JSON with invalid message schema', async () => {
    const server = createServer();

    const roomManager = createTestRoomManager();
    const metrics = createTestMetrics();

    const wss = setupWebSocket(
      server,
      roomManager,
      metrics,
    );

    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');

      const address = server.address();

      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/ws`,
        {
          origin: TEST_ORIGIN,
        },
      );

      await once(socket, 'open');

      const closed = new Promise((resolve, reject) => {
        socket.once('close', (code, reason) => {
          resolve({
            code,
            reason: reason.toString(),
          });
        });

        socket.once('error', reject);
      });

      // Повідомлення з невідомим типом.
      socket.send(
        JSON.stringify({
          type: 'unknown_message',
          value: 123,
        }),
      );

      const result = await closed;

      expect(result.code).toBe(1008);

      expect(result.reason).toBe(
        'Invalid message',
      );
    } finally {
      await new Promise((resolve) => {
        wss.close(() => resolve());
      });

      await new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
  }, 10000);
});