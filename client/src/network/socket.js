
/* global WebSocket, URL, window, setTimeout, clearTimeout, TextEncoder */

import { encodeInput } from '../../../shared/src/binary-protocol.js';

export class GameSocket {
  constructor(url = '/ws') {
    this.url = url;
    this.socket = null;

    this.queue = [];
    this.listeners = new Map();

    this.joined = false;
    this.joinData = null;

    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    this.maxReconnectDelay = 10000;
    this.shouldReconnect = false;

    // Мережева статистика.
    this.sentBytes = 0;
    this.receivedBytes = 0;
    this.sentMessages = 0;
    this.receivedMessages = 0;
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type).add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  emit(type, data) {
    for (const callback of this.listeners.get(type) ?? []) {
      callback(data);
    }
  }

  // ========================================
  // МЕРЕЖЕВА СТАТИСТИКА
  // ========================================

  recordSent(data) {
    if (typeof data === 'string') {
      this.sentBytes += new TextEncoder().encode(data).byteLength;
    } else if (data instanceof ArrayBuffer) {
      this.sentBytes += data.byteLength;
    }

    this.sentMessages += 1;
  }

  recordReceived(data) {
    if (typeof data === 'string') {
      this.receivedBytes += new TextEncoder().encode(data).byteLength;
    } else if (data instanceof ArrayBuffer) {
      this.receivedBytes += data.byteLength;
    }

    this.receivedMessages += 1;
  }

  // ========================================
  // НАДСИЛАННЯ ДАНИХ
  // ========================================

  sendRaw(data) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    this.socket.send(data);
    this.recordSent(data);

    return true;
  }

  // ========================================
  // ПІДКЛЮЧЕННЯ WEBSOCKET
  // ========================================

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.shouldReconnect = true;
    this.joined = false;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    const url = new URL(this.url, window.location.href);

    url.protocol =
      url.protocol === 'https:' ? 'wss:' : 'ws:';

    const socket = new WebSocket(url);

    this.socket = socket;

    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;

      this.reconnectAttempts = 0;

      this.emit('open');

      if (this.joinData) {
        this.sendRaw(JSON.stringify(this.joinData));
      } else {
        this.flushQueue();
      }
    });

    // ========================================
    // ОТРИМАННЯ ПОВІДОМЛЕНЬ
    // ========================================

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;

      this.recordReceived(event.data);

      let message;

      try {
        message = JSON.parse(event.data);
      } catch (error) {
        this.emit('error', {
          message: 'Invalid server JSON',
          error,
        });

        return;
      }

      if (message.type === 'joined') {
        this.joined = true;
      }

      this.emit('message', message);
      this.emit(message.type, message);

      if (message.type === 'joined') {
        this.flushQueue();
      }
    });

    // ========================================
    // ВІДКЛЮЧЕННЯ
    // ========================================

    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return;

      this.socket = null;
      this.joined = false;

      this.emit('close', event);

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;

      this.emit('error', {
        message: 'WebSocket connection error',
      });
    });
  }

  // ========================================
  // ПІДКЛЮЧЕННЯ ДО КІМНАТИ
  // ========================================

  join(roomId, name) {
    this.joined = false;

    this.joinData = {
      type: 'join',
      roomId,
      name,
    };

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendRaw(JSON.stringify(this.joinData));
    }
  }

  // ========================================
  // JSON-ПОВІДОМЛЕННЯ
  // ========================================

  send(message) {
    const data = JSON.stringify(message);

    if (this.socket?.readyState === WebSocket.OPEN) {
      if (this.joinData && !this.joined) {
        this.enqueue(data);
        return;
      }

      this.sendRaw(data);
      return;
    }

    this.enqueue(data);
  }

  // ========================================
  // BINARY INPUT
  // ========================================

  sendBinaryInput(input) {
    if (
      !Number.isSafeInteger(input.seq) ||
      input.seq < 1 ||
      input.seq > 0xffffffff
    ) {
      throw new RangeError(
        'Invalid binary input sequence',
      );
    }

    // Кодуємо команди керування в 6 байтів.
    const buffer = encodeInput(input);

    if (
      this.socket?.readyState === WebSocket.OPEN &&
      this.joined
    ) {
      this.sendRaw(buffer);
      return true;
    }

    // Застарілі команди під час перепідключення
    // не додаємо до черги.
    return false;
  }

  // ========================================
  // ЧЕРГА JSON-ПОВІДОМЛЕНЬ
  // ========================================

  enqueue(data) {
    if (this.queue.length >= 100) {
      this.queue.shift();
    }

    this.queue.push(data);
  }

  flushQueue() {
    while (
      this.queue.length > 0 &&
      this.socket?.readyState === WebSocket.OPEN &&
      (!this.joinData || this.joined)
    ) {
      this.sendRaw(this.queue.shift());
    }
  }

  // ========================================
  // ОТРИМАННЯ МЕРЕЖЕВОЇ СТАТИСТИКИ
  // ========================================

  getNetworkStats() {
    return {
      sentBytes: this.sentBytes,
      receivedBytes: this.receivedBytes,
      sentMessages: this.sentMessages,
      receivedMessages: this.receivedMessages,
    };
  }

  // ========================================
  // АВТОМАТИЧНЕ ПЕРЕПІДКЛЮЧЕННЯ
  // ========================================

  scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay = Math.min(
      500 * 2 ** this.reconnectAttempts,
      this.maxReconnectDelay,
    );

    this.reconnectAttempts += 1;

    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  // ========================================
  // РУЧНЕ ВІДКЛЮЧЕННЯ
  // ========================================

  disconnect() {
    this.shouldReconnect = false;
    this.joined = false;
    this.joinData = null;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    this.queue = [];

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;

      socket.close(1000, 'Client disconnect');
    }
  }
}
