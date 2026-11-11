
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Room } from './room.js';

const DEFAULT_ROOM_NAME = 'Lab 5 Battle';

export class RoomManager extends EventEmitter {
  constructor() {
    super();

    this.rooms = new Map();

    this.on('error', (error) => {
      console.error(
        '[RoomManager] Error:',
        error.message,
      );
    });
  }

  // ========================================
  // СТВОРЕННЯ КІМНАТИ
  // ========================================

  createRoom(name, maxPlayers = 2) {
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.trim().length > 50
    ) {
      throw new Error(
        'Room name must contain 1-50 characters',
      );
    }

    if (
      !Number.isInteger(maxPlayers) ||
      maxPlayers < 1 ||
      maxPlayers > 2
    ) {
      throw new Error(
        'maxPlayers must be between 1 and 2',
      );
    }

    const roomName = name.trim();
    const id = randomUUID();

    const room = new Room(
      id,
      roomName,
      maxPlayers,
    );

    this.rooms.set(id, room);

    // ========================================
    // ПОДІЇ ГРАВЦІВ
    // ========================================

    room.on('playerJoined', (data) => {
      this.emit('playerJoined', data);
    });

    room.on('playerLeft', (data) => {
      this.emit('playerLeft', data);
    });

    room.on('chat', (data) => {
      this.emit('chat', data);
    });

    room.on('snapshot', (data) => {
      this.emit('snapshot', data);
    });

    // ========================================
    // ОБРОБКА ПОРОЖНЬОЇ КІМНАТИ
    // ========================================

    room.on('empty', () => {
      room.gameLoop.stop();

      // Стандартну кімнату не видаляємо.
      if (room.name === DEFAULT_ROOM_NAME) {
        console.log(
          `[Rooms] Default room preserved: ${room.name}`,
        );

        return;
      }

      // Інші порожні кімнати видаляємо.
      this.rooms.delete(id);

      this.emit('roomDeleted', {
        roomId: id,
      });
    });

    this.emit('roomCreated', {
      roomId: id,
      name: room.name,
    });

    return room;
  }

  // ========================================
  // ПОШУК КІМНАТИ
  // ========================================

  getRoom(id) {
    return this.rooms.get(id) ?? null;
  }

  // ========================================
  // СПИСОК КІМНАТ
  // ========================================

  listRooms() {
    return [...this.rooms.values()].map(
      (room) => room.toJSON(),
    );
  }

  // ========================================
  // ВИДАЛЕННЯ КІМНАТИ
  // ========================================

  deleteRoom(id) {
    const room = this.rooms.get(id);

    if (!room) {
      return false;
    }

    if (room.name === DEFAULT_ROOM_NAME) {
      throw new Error(
        'Cannot delete the default room',
      );
    }

    if (!room.isEmpty) {
      throw new Error(
        'Cannot delete a room with players',
      );
    }

    room.gameLoop.stop();
    this.rooms.delete(id);

    this.emit('roomDeleted', {
      roomId: id,
    });

    return true;
  }
}
