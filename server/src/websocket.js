
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { decodeInput } from '../../shared/src/binary-protocol.js';

const MAX_MESSAGE_SIZE = 4096;
const MAX_MESSAGES_PER_SECOND = 120;
const JOIN_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 15000;
const MAX_BUFFERED_BYTES = 1024 * 1024;

export function setupWebSocket(server, roomManager) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_MESSAGE_SIZE,
  });

  // ========================================
  // НАДСИЛАННЯ JSON
  // ========================================

  function send(socket, data) {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      socket.close(1013, 'Client too slow');
      return;
    }

    socket.send(JSON.stringify(data));
  }

  // ========================================
  // НАДСИЛАННЯ ВСІМ ГРАВЦЯМ
  // ========================================

  function broadcast(room, data) {
    for (const player of room.players.values()) {
      send(player.socket, data);
    }
  }

  // ========================================
  // SERVER SNAPSHOTS
  // ========================================

  roomManager.on('snapshot', (data) => {
    const room = roomManager.getRoom(data.roomId);

    if (!room) {
      return;
    }

    for (const player of room.players.values()) {
      send(player.socket, {
        type: 'snapshot',
        roomId: data.roomId,
        snapshot: data.snapshot,
        ack: data.lastProcessedSeq[player.id] ?? 0,
      });
    }
  });

  // ========================================
  // НОВЕ ПІДКЛЮЧЕННЯ
  // ========================================

  wss.on('connection', (socket) => {
    const playerId = randomUUID();

    let currentRoom = null;
    let messageCount = 0;
    let rateWindowStart = Date.now();
    let missedPongs = 0;

    console.log(`[WS] Connected: ${playerId}`);

    const joinTimer = setTimeout(() => {
      if (!currentRoom) {
        socket.close(1008, 'Join timeout');
      }
    }, JOIN_TIMEOUT_MS);

    socket.on('pong', () => {
      missedPongs = 0;
    });

    // ========================================
    // ОБРОБКА ПОВІДОМЛЕНЬ
    // ========================================

    socket.on('message', (raw, isBinary) => {
      const now = Date.now();

      if (now - rateWindowStart >= 1000) {
        rateWindowStart = now;
        messageCount = 0;
      }

      messageCount += 1;

      if (messageCount > MAX_MESSAGES_PER_SECOND) {
        socket.close(1008, 'Rate limit exceeded');
        return;
      }

      let message;

      // ====================================
      // BINARY АБО JSON
      // ====================================

      if (isBinary) {
        try {
          // Buffer від бібліотеки ws перетворюємо
          // на ArrayBuffer точної довжини.
          const binary = raw.buffer.slice(
            raw.byteOffset,
            raw.byteOffset + raw.byteLength,
          );

          message = decodeInput(binary);
        } catch (error) {
          console.error(
            '[WS] Invalid binary input:',
            error.message,
          );

          socket.close(1003, 'Invalid binary message');
          return;
        }
      } else {
        try {
          message = JSON.parse(raw.toString());
        } catch {
          socket.close(1007, 'Invalid JSON');
          return;
        }
      }

      if (
        !message ||
        typeof message !== 'object' ||
        Array.isArray(message) ||
        typeof message.type !== 'string'
      ) {
        socket.close(1008, 'Invalid message');
        return;
      }

      // ====================================
      // ТИПИ ПОВІДОМЛЕНЬ
      // ====================================

      switch (message.type) {
        // ----------------------------------
        // PING / PONG
        // ----------------------------------

        case 'ping': {
          if (
            !Number.isSafeInteger(message.id) ||
            message.id < 0
          ) {
            socket.close(1008, 'Invalid ping');
            return;
          }

          send(socket, {
            type: 'pong',
            id: message.id,
          });

          break;
        }

        // ----------------------------------
        // JOIN
        // ----------------------------------

        case 'join': {
          if (currentRoom) {
            socket.close(1008, 'Already joined');
            return;
          }

          if (
            typeof message.roomId !== 'string' ||
            typeof message.name !== 'string' ||
            message.name.trim().length === 0 ||
            message.name.length > 30
          ) {
            socket.close(1008, 'Invalid join data');
            return;
          }

          const room = roomManager.getRoom(message.roomId);

          if (!room) {
            socket.close(1008, 'Room not found');
            return;
          }

          try {
            room.join(
              playerId,
              message.name,
              socket,
            );
          } catch {
            socket.close(1008, 'Cannot join room');
            return;
          }

          currentRoom = room;
          clearTimeout(joinTimer);

          send(socket, {
            type: 'joined',
            playerId,
            room: room.toJSON(),
            seed: room.seed,
            tickRate: 30,
          });

          broadcast(room, {
            type: 'player_joined',
            playerId,
            name: message.name.trim(),
          });

          break;
        }

        // ----------------------------------
        // INPUT (JSON + BINARY)
        // ----------------------------------

        case 'input': {
          if (!currentRoom) {
            socket.close(1008, 'Join required');
            return;
          }

          if (
            !Number.isSafeInteger(message.seq) ||
            message.seq < 1 ||
            message.seq > 0xffffffff ||
            typeof message.thrust !== 'boolean' ||
            typeof message.left !== 'boolean' ||
            typeof message.right !== 'boolean' ||
            typeof message.shoot !== 'boolean'
          ) {
            socket.close(1008, 'Invalid input');
            return;
          }

          try {
            currentRoom.receiveInput(playerId, {
              seq: message.seq,
              thrust: message.thrust,
              left: message.left,
              right: message.right,
              shoot: message.shoot,
            });
          } catch {
            socket.close(1008, 'Invalid input sequence');
          }

          break;
        }

        // ----------------------------------
        // CHAT
        // ----------------------------------

        case 'chat': {
          if (!currentRoom) {
            socket.close(1008, 'Join required');
            return;
          }

          try {
            const payload = currentRoom.chat(
              playerId,
              message.text,
            );

            broadcast(currentRoom, {
              type: 'chat',
              ...payload,
            });
          } catch {
            socket.close(1008, 'Invalid chat message');
          }

          break;
        }

        // ----------------------------------
        // LEAVE
        // ----------------------------------

        case 'leave': {
          if (!currentRoom) {
            socket.close(1008, 'Not in room');
            return;
          }

          socket.close(1000, 'Left room');
          break;
        }

        default:
          socket.close(1008, 'Unknown message type');
      }
    });

    // ========================================
    // ВІДКЛЮЧЕННЯ
    // ========================================

    socket.on('close', () => {
      clearTimeout(joinTimer);

      if (currentRoom) {
        const room = currentRoom;
        currentRoom = null;

        room.leave(playerId);

        if (!room.isEmpty) {
          broadcast(room, {
            type: 'player_left',
            playerId,
          });
        }
      }

      console.log(`[WS] Disconnected: ${playerId}`);
    });

    socket.on('error', (error) => {
      console.error(
        '[WS] Socket error:',
        error.message,
      );
    });

    // ========================================
    // HEARTBEAT
    // ========================================

    const heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }

      missedPongs += 1;

      if (missedPongs >= 2) {
        socket.terminate();
        return;
      }

      socket.ping();
    }, HEARTBEAT_MS);

    socket.on('close', () => {
      clearInterval(heartbeat);
    });
  });

  wss.on('error', (error) => {
    console.error(
      '[WS] Server error:',
      error.message,
    );
  });

  return wss;
}
