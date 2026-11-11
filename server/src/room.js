
import { EventEmitter } from 'node:events';

import {
  createWorld,
  createShip,
  createSnapshot,
  normalizeInput,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '@space-arena/shared';

import { GameLoop } from './game-loop.js';

const MAX_INPUT_QUEUE = 256;

export class Room extends EventEmitter {
  constructor(id, name, maxPlayers = 2) {
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

    // Авторитетний ігровий світ сервера.
    this.seed =
      Math.floor(Math.random() * 0xffffffff) >>> 0;

    this.world = createWorld(this.seed);

    // Черги команд гравців.
    this.inputs = new Map();

    // Останній отриманий номер команди.
    this.lastReceivedSeq = new Map();

    // Останній оброблений номер команди.
    this.lastProcessedSeq = new Map();

    this.gameLoop = new GameLoop(
      this.world,
      () => this.collectInputs(),
      () => this.broadcastSnapshot(),
    );

    this.on('error', (error) => {
      console.error(
        `[Room ${this.id}] Error:`,
        error.message,
      );
    });
  }

  // ========================================
  // ПІДКЛЮЧЕННЯ ГРАВЦЯ
  // ========================================

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

    // Початкові позиції кораблів.
    const index = this.players.size - 1;

    const x =
      index % 2 === 0
        ? WORLD_WIDTH * 0.25
        : WORLD_WIDTH * 0.75;

    const y = WORLD_HEIGHT * 0.5;

    const angle =
      index % 2 === 0 ? 0 : Math.PI;

    this.world.ships[playerId] = createShip(
      playerId,
      x,
      y,
      angle,
    );

    // Ініціалізація черги команд.
    this.inputs.set(playerId, []);

    this.lastReceivedSeq.set(
      playerId,
      0,
    );

    this.lastProcessedSeq.set(
      playerId,
      0,
    );

    if (!this.gameLoop.running) {
      this.gameLoop.start();
    }

    this.emit('playerJoined', {
      roomId: this.id,
      playerId,
      playerName: player.name,
    });

    return player;
  }

  // ========================================
  // ОТРИМАННЯ КОМАНД ВІД КЛІЄНТА
  // ========================================

  receiveInput(playerId, rawInput) {
    if (!this.players.has(playerId)) {
      throw new Error('Player not in room');
    }

    if (
      !rawInput ||
      !Number.isSafeInteger(rawInput.seq) ||
      rawInput.seq < 1
    ) {
      throw new Error('Invalid input sequence');
    }

    const lastReceived =
      this.lastReceivedSeq.get(playerId) ?? 0;

    const lastProcessed =
      this.lastProcessedSeq.get(playerId) ?? 0;

    // Ігноруємо повторні та застарілі команди.
    if (
      rawInput.seq <= lastReceived ||
      rawInput.seq <= lastProcessed
    ) {
      return false;
    }

    const queue = this.inputs.get(playerId);

    if (!queue) {
      return false;
    }

    // Захист від переповнення черги.
    if (queue.length >= MAX_INPUT_QUEUE) {
      return false;
    }

    const input = normalizeInput(rawInput);

    queue.push(input);

    this.lastReceivedSeq.set(
      playerId,
      input.seq,
    );

    return true;
  }

  // ========================================
  // ОБРОБКА КОМАНД НА СЕРВЕРНОМУ ТАКТІ
  // ========================================

  collectInputs() {
    const inputs = {};

    for (const playerId of this.players.keys()) {
      const queue = this.inputs.get(playerId);

      if (queue && queue.length > 0) {
        // Одна команда на один такт.
        const input = queue.shift();

        inputs[playerId] = input;

        // ACK оновлюється лише після вибору
        // команди для серверної симуляції.
        this.lastProcessedSeq.set(
          playerId,
          input.seq,
        );
      } else {
        // Якщо нової команди немає,
        // використовуємо нейтральне керування.
        // Не повторюємо старі натискання.
        inputs[playerId] = normalizeInput();
      }
    }

    return inputs;
  }

  // ========================================
  // ПЕРЕДАВАННЯ СТАНУ ГРИ
  // ========================================

  broadcastSnapshot() {
    const snapshot = createSnapshot(
      this.world,
    );

    const lastProcessedSeq =
      Object.fromEntries(
        this.lastProcessedSeq,
      );

    this.emit('snapshot', {
      roomId: this.id,
      snapshot,
      lastProcessedSeq,
    });
  }

  // ========================================
  // ВИХІД ГРАВЦЯ
  // ========================================

  leave(playerId) {
    const player = this.players.get(
      playerId,
    );

    if (!player) {
      return false;
    }

    this.players.delete(playerId);

    delete this.world.ships[playerId];

    this.inputs.delete(playerId);

    this.lastReceivedSeq.delete(
      playerId,
    );

    this.lastProcessedSeq.delete(
      playerId,
    );

    // Видаляємо кулі гравця.
    this.world.bullets =
      this.world.bullets.filter(
        (bullet) =>
          bullet.ownerId !== playerId,
      );

    this.emit('playerLeft', {
      roomId: this.id,
      playerId,
      playerName: player.name,
    });

    if (this.players.size === 0) {
      this.gameLoop.stop();

      this.emit('empty', {
        roomId: this.id,
      });
    }

    return true;
  }

  // ========================================
  // ЧАТ КІМНАТИ
  // ========================================

  chat(playerId, message) {
    const player = this.players.get(
      playerId,
    );

    if (!player) {
      throw new Error('Player not in room');
    }

    if (
      typeof message !== 'string' ||
      !message.trim() ||
      message.length > 500
    ) {
      throw new Error(
        'Invalid chat message',
      );
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

  // ========================================
  // ДОПОМІЖНІ ВЛАСТИВОСТІ
  // ========================================

  get isEmpty() {
    return this.players.size === 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
      tick: this.world.tick,
    };
  }
}
