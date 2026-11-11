
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Room } from './room.js';

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

    const id = randomUUID();

    const room = new Room(
      id,
      name.trim(),
      maxPlayers,
    );

    this.rooms.set(id, room);

    room.on('playerJoined', (data) => {
      this.emit('playerJoined', data);
    });

    room.on('playerLeft', (data) => {
      this.emit('playerLeft', data);
    });

    room.on('chat', (data) => {
      this.emit('chat', data);
    });

    // Forward authoritative game snapshots.
    room.on('snapshot', (data) => {
      this.emit('snapshot', data);
    });

    room.on('empty', () => {
      room.gameLoop.stop();
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

  getRoom(id) {
    return this.rooms.get(id) ?? null;
  }

  listRooms() {
    return [...this.rooms.values()].map(
      (room) => room.toJSON(),
    );
  }

  deleteRoom(id) {
    const room = this.rooms.get(id);

    if (!room) {
      return false;
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
