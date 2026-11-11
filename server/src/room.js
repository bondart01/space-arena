
import { EventEmitter } from 'node:events';

export class Room extends EventEmitter {
  constructor(id, name, maxPlayers = 8) {
    super();

    if (
      typeof id !== 'string' ||
      !id.trim() ||
      typeof name !== 'string' ||
      !name.trim() ||
      !Number.isInteger(maxPlayers) ||
      maxPlayers < 1
    ) {
      throw new Error('Invalid room configuration');
    }

    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.players = new Map();
    this.createdAt = Date.now();

    // EventEmitter: помилки повинні мати обробник.
    this.on('error', (error) => {
      console.error(
        `[Room ${this.id}] Error:`,
        error.message,
      );
    });
  }

  join(playerId, playerName, socket) {
    if (this.players.has(playerId)) {
      throw new Error('Player already joined');
    }

    if (this.players.size >= this.maxPlayers) {
      throw new Error('Room is full');
    }

    if (
      typeof playerName !== 'string' ||
      !playerName.trim()
    ) {
      throw new Error('Invalid player name');
    }

    const player = {
      id: playerId,
      name: playerName.trim(),
      socket,
      joinedAt: Date.now(),
    };

    this.players.set(playerId, player);

    this.emit('playerJoined', {
      roomId: this.id,
      playerId,
      playerName: player.name,
    });

    return player;
  }

  leave(playerId) {
    const player = this.players.get(playerId);

    if (!player) {
      return false;
    }

    this.players.delete(playerId);

    this.emit('playerLeft', {
      roomId: this.id,
      playerId,
      playerName: player.name,
    });

    if (this.players.size === 0) {
      this.emit('empty', {
        roomId: this.id,
      });
    }

    return true;
  }

  chat(playerId, message) {
    const player = this.players.get(playerId);

    if (!player) {
      throw new Error('Player not in room');
    }

    if (
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 500
    ) {
      throw new Error('Invalid chat message');
    }

    const payload = {
      roomId: this.id,
      playerId,
      playerName: player.name,
      message: message.trim(),
      timestamp: Date.now(),
    };

    this.emit('chat', payload);

    return payload;
  }

  get isEmpty() {
    return this.players.size === 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
    };
  }
}
