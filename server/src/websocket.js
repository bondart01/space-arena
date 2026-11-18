
import { randomUUID } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';

import { decodeInput } from '@space-arena/shared/binary-protocol';
import { parseClientMessage } from '@space-arena/shared/protocol';

import { config } from './config.ts';
import { logger, createPlayerLogger } from './logger.js';

const MAX_MESSAGE_SIZE = 4096;
const MAX_MESSAGES_PER_SECOND = 120;
const JOIN_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 15000;
const MAX_BUFFERED_BYTES = 1024 * 1024;

export function setupWebSocket(server, roomManager, metrics) {
  const connectionsPerIp = new Map();

  let shuttingDown = false;

  function getClientIp(request) {
    return request.socket.remoteAddress ?? 'unknown';
  }

  function getPlayerCount() {
    let count = 0;

    for (const room of roomManager.rooms.values()) {
      count += room.players.size;
    }

    return count;
  }

  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: MAX_MESSAGE_SIZE,

    verifyClient(info, callback) {
      if (shuttingDown) {
        callback(false, 503, 'Server shutting down');
        return;
      }

      const origin = info.origin;

      if (!origin || !config.allowedOrigins.includes(origin)) {
        logger.warn(
          {
            event: 'websocket_origin_rejected',
            origin,
          },
          'Rejected WebSocket origin',
        );

        callback(false, 403, 'Origin not allowed');
        return;
      }

      const ip = getClientIp(info.req);
      const activeConnections =
        connectionsPerIp.get(ip) ?? 0;

      if (
        activeConnections >=
        config.maxConnectionsPerIp
      ) {
        logger.warn(
          {
            event: 'connection_limit_exceeded',
            ip,
            activeConnections,
          },
          'WebSocket connection limit exceeded',
        );

        callback(false, 429, 'Too many connections');
        return;
      }

      if (getPlayerCount() >= config.maxPlayers) {
        logger.warn(
          {
            event: 'player_limit_reached',
            activePlayers: getPlayerCount(),
          },
          'Server player limit reached',
        );

        callback(false, 503, 'Server is full');
        return;
      }

      callback(true);
    },
  });

  // ========================================
  // GRACEFUL SHUTDOWN
  // ========================================

  wss.beginShutdown = () => {
    shuttingDown = true;

    logger.info(
      {
        event: 'websocket_shutdown_started',
      },
      'WebSocket server stopping new connections',
    );
  };

  // ========================================
  // ВІДПРАВЛЕННЯ ПОВІДОМЛЕНЬ
  // ========================================

  function send(socket, data) {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      logger.warn(
        {
          event: 'slow_client_disconnected',
          bufferedBytes: socket.bufferedAmount,
        },
        'Disconnecting slow WebSocket client',
      );

      socket.close(1013, 'Client too slow');
      return;
    }

    const payload = JSON.stringify(data);

    socket.send(payload);

    metrics.recordSent(
      Buffer.byteLength(payload),
    );
  }

  function broadcast(room, data) {
    for (const player of room.players.values()) {
      send(player.socket, data);
    }
  }

  // ========================================
  // СИНХРОНІЗАЦІЯ ІГРОВОГО СТАНУ
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
  // WEBSOCKET CONNECTION
  // ========================================

  wss.on('connection', (socket, request) => {
    const playerId = randomUUID();
    const ip = getClientIp(request);

    connectionsPerIp.set(
      ip,
      (connectionsPerIp.get(ip) ?? 0) + 1,
    );

    let currentRoom = null;
    let messageCount = 0;
    let rateWindowStart = Date.now();
    let missedPongs = 0;

    const playerLogger = logger.child({
      playerId,
      ip,
    });

    playerLogger.info(
      {
        event: 'websocket_connected',
      },
      'WebSocket client connected',
    );

    const joinTimer = setTimeout(() => {
      if (!currentRoom) {
        playerLogger.warn(
          {
            event: 'join_timeout',
          },
          'Player did not join a room in time',
        );

        socket.close(1008, 'Join timeout');
      }
    }, JOIN_TIMEOUT_MS);

    socket.on('pong', () => {
      missedPongs = 0;
    });

    // ========================================
    // ОТРИМАННЯ ПОВІДОМЛЕНЬ
    // ========================================

    socket.on('message', (raw, isBinary) => {
      metrics.recordReceived(raw.length);

      if (shuttingDown) {
        return;
      }

      const now = Date.now();

      if (now - rateWindowStart >= 1000) {
        rateWindowStart = now;
        messageCount = 0;
      }

      messageCount += 1;

      if (messageCount > MAX_MESSAGES_PER_SECOND) {
        playerLogger.warn(
          {
            event: 'message_rate_exceeded',
            roomId: currentRoom?.id ?? null,
            messageCount,
          },
          'WebSocket message rate exceeded',
        );

        socket.close(
          1008,
          'Rate limit exceeded',
        );

        return;
      }

      let message;

      if (isBinary) {
        try {
          const binary = raw.buffer.slice(
            raw.byteOffset,
            raw.byteOffset + raw.byteLength,
          );

          message = decodeInput(binary);
        } catch (error) {
          playerLogger.warn(
            {
              event: 'invalid_binary_message',
              roomId: currentRoom?.id ?? null,
              error: error.message,
            },
            'Invalid binary input',
          );

          socket.close(
            1003,
            'Invalid binary message',
          );

          return;
        }
      } else {
        try {
          const value = JSON.parse(
            raw.toString(),
          );

          message = parseClientMessage(value);

          if (!message) {
            playerLogger.warn(
              {
                event: 'invalid_client_message',
                roomId: currentRoom?.id ?? null,
              },
              'Invalid client message',
            );

            socket.close(
              1008,
              'Invalid message',
            );

            return;
          }
        } catch (error) {
          playerLogger.warn(
            {
              event: 'invalid_json',
              roomId: currentRoom?.id ?? null,
              error: error.message,
            },
            'Invalid JSON message',
          );

          socket.close(
            1007,
            'Invalid JSON',
          );

          return;
        }
      }

      // ========================================
      // ОБРОБКА ТИПІВ ПОВІДОМЛЕНЬ
      // ========================================

      switch (message.type) {
        case 'ping': {
          send(socket, {
            type: 'pong',
            id: message.id,
          });

          break;
        }

        case 'join': {
          if (currentRoom) {
            socket.close(
              1008,
              'Already joined',
            );

            return;
          }

          if (
            getPlayerCount() >=
            config.maxPlayers
          ) {
            playerLogger.warn(
              {
                event: 'join_player_limit_reached',
              },
              'Player cannot join: server is full',
            );

            socket.close(
              1013,
              'Server is full',
            );

            return;
          }

          const room = roomManager.getRoom(
            message.roomId,
          );

          if (!room) {
            playerLogger.warn(
              {
                event: 'room_not_found',
                requestedRoomId: message.roomId,
              },
              'Requested room does not exist',
            );

            socket.close(
              1008,
              'Room not found',
            );

            return;
          }

          try {
            room.join(
              playerId,
              message.name,
              socket,
            );
          } catch (error) {
            playerLogger.warn(
              {
                event: 'room_join_failed',
                roomId: room.id,
                error: error.message,
              },
              'Player could not join room',
            );

            socket.close(
              1008,
              'Cannot join room',
            );

            return;
          }

          currentRoom = room;
          clearTimeout(joinTimer);

          createPlayerLogger(
            room.id,
            playerId,
          ).info(
            {
              event: 'player_joined_room',
            },
            'Player joined room',
          );

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

        case 'input': {
          if (!currentRoom) {
            socket.close(
              1008,
              'Join required',
            );

            return;
          }

          try {
            currentRoom.receiveInput(
              playerId,
              {
                seq: message.seq,
                thrust: message.thrust,
                left: message.left,
                right: message.right,
                shoot: message.shoot,
              },
            );
          } catch (error) {
            playerLogger.warn(
              {
                event: 'invalid_input_sequence',
                roomId: currentRoom.id,
                error: error.message,
              },
              'Invalid player input sequence',
            );

            socket.close(
              1008,
              'Invalid input sequence',
            );
          }

          break;
        }

        case 'chat': {
          if (!currentRoom) {
            socket.close(
              1008,
              'Join required',
            );

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
          } catch (error) {
            playerLogger.warn(
              {
                event: 'invalid_chat_message',
                roomId: currentRoom.id,
                error: error.message,
              },
              'Invalid chat message',
            );

            socket.close(
              1008,
              'Invalid chat message',
            );
          }

          break;
        }

        case 'leave': {
          if (!currentRoom) {
            socket.close(
              1008,
              'Not in room',
            );

            return;
          }

          socket.close(
            1000,
            'Left room',
          );

          break;
        }

        default: {
          playerLogger.warn(
            {
              event: 'unknown_message_type',
              roomId: currentRoom?.id ?? null,
              messageType: message.type,
            },
            'Unknown WebSocket message type',
          );

          socket.close(
            1008,
            'Unknown message type',
          );
        }
      }
    });

    // ========================================
    // ВІДКЛЮЧЕННЯ ГРАВЦЯ
    // ========================================

    socket.on('close', (code, reason) => {
      clearTimeout(joinTimer);
      clearInterval(heartbeat);

      const remaining =
        (connectionsPerIp.get(ip) ?? 1) - 1;

      if (remaining <= 0) {
        connectionsPerIp.delete(ip);
      } else {
        connectionsPerIp.set(ip, remaining);
      }

      const previousRoomId = currentRoom?.id ?? null;

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

      playerLogger.info(
        {
          event: 'websocket_disconnected',
          roomId: previousRoomId,
          closeCode: code,
          reason: reason.toString(),
        },
        'WebSocket client disconnected',
      );
    });

    socket.on('error', (error) => {
      playerLogger.error(
        {
          event: 'websocket_socket_error',
          roomId: currentRoom?.id ?? null,
          err: error,
        },
        'WebSocket socket error',
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
        playerLogger.warn(
          {
            event: 'heartbeat_timeout',
            roomId: currentRoom?.id ?? null,
          },
          'WebSocket heartbeat timeout',
        );

        socket.terminate();
        return;
      }

      socket.ping();
    }, HEARTBEAT_MS);
  });

  wss.on('error', (error) => {
    logger.error(
      {
        event: 'websocket_server_error',
        err: error,
      },
      'WebSocket server error',
    );
  });

  return wss;
}
