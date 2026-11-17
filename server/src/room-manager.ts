import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Room } from './room.js';

const DEFAULT_ROOM_NAME = 'Lab 5 Battle';

/** Typed room lifecycle and event forwarding. */
export class RoomManager extends EventEmitter {
  readonly rooms = new Map<string, Room>();

  constructor() {
    super();
    this.on('error', (error: Error) => console.error('[RoomManager] Error:', error.message));
  }

  createRoom(name: string, maxPlayers = 2): Room {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 50) {
      throw new Error('Room name must contain 1-50 characters');
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 2) {
      throw new Error('maxPlayers must be between 1 and 2');
    }
    const id = randomUUID();
    const room = new Room(id, name.trim(), maxPlayers);
    this.rooms.set(id, room);

    for (const event of ['playerJoined', 'playerLeft', 'chat', 'snapshot'] as const) {
      room.on(event, (data: unknown) => this.emit(event, data));
    }
    room.on('empty', () => {
      room.gameLoop.stop();
      if (room.name === DEFAULT_ROOM_NAME) {
        console.log(`[Rooms] Default room preserved: ${room.name}`);
        return;
      }
      this.rooms.delete(id);
      this.emit('roomDeleted', { roomId: id });
    });
    this.emit('roomCreated', { roomId: id, name: room.name });
    return room;
  }

  getRoom(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }

  listRooms(): ReturnType<Room['toJSON']>[] {
    return [...this.rooms.values()].map((room) => room.toJSON());
  }

  deleteRoom(id: string): boolean {
    const room = this.rooms.get(id);
    if (!room) return false;
    if (room.name === DEFAULT_ROOM_NAME) throw new Error('Cannot delete the default room');
    if (!room.isEmpty) throw new Error('Cannot delete a room with players');
    room.gameLoop.stop();
    this.rooms.delete(id);
    this.emit('roomDeleted', { roomId: id });
    return true;
  }
}
