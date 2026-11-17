import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';
import { setupWebSocket } from '../src/websocket.js';

describe('WebSocket rate limiting', () => {
  it('closes connection after more than 120 messages per second', async () => {
    const server = createServer();
    const roomManager = new EventEmitter();

    roomManager.getRoom = () => null;

    const wss = setupWebSocket(server, roomManager);

    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');

      const address = server.address();
      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/ws`
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

      for (let i = 0; i < 121; i++) {
        socket.send(JSON.stringify({
          type: 'ping',
          id: i,
        }));
      }

      const result = await closed;

      expect(result.code).toBe(1008);
      expect(result.reason).toBe('Rate limit exceeded');
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

describe('WebSocket invalid messages', () => {
  it('rejects malformed JSON', async () => {
    const server = createServer();
    const roomManager = new EventEmitter();

    roomManager.getRoom = () => null;

    const wss = setupWebSocket(server, roomManager);

    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');

      const address = server.address();

      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/ws`
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

      socket.send('{invalid-json');

      const result = await closed;

      expect(result.code).toBe(1007);
      expect(result.reason).toBe('Invalid JSON');
    } finally {
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    }
  }, 10000);
});

describe('WebSocket message validation', () => {
  it('rejects JSON with invalid message schema', async () => {
    const server = createServer();
    const roomManager = new EventEmitter();

    roomManager.getRoom = () => null;

    const wss = setupWebSocket(server, roomManager);

    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');

      const address = server.address();

      const socket = new WebSocket(
        `ws://127.0.0.1:${address.port}/ws`
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

      socket.send(JSON.stringify({
        type: 'unknown_message',
        value: 123,
      }));

      const result = await closed;

      expect(result.code).toBe(1008);
      expect(result.reason).toBe('Invalid message');
    } finally {
      await new Promise((resolve) => wss.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    }
  }, 10000);
});


