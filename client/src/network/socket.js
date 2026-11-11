
export class GameSocket {
  constructor(url = '/ws') {
    this.url = url;
    this.socket = null;

    this.queue = [];
    this.listeners = new Map();

    this.reconnectAttempts = 0;
    this.reconnectTimer = null;

    this.maxReconnectDelay = 10000;
    this.shouldReconnect = false;

    // Дані для автоматичного повторного входу
    this.joinData = null;
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

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.shouldReconnect = true;

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

      // Автоматично входимо в кімнату
      if (this.joinData) {
        socket.send(JSON.stringify(this.joinData));
      } else {
        this.flushQueue();
      }
    });

    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return;

      try {
        const message = JSON.parse(event.data);

        this.emit('message', message);
        this.emit(message.type, message);

        // Після підтвердження входу надсилаємо чергу
        if (message.type === 'joined') {
          this.flushQueue();
        }
      } catch {
        this.emit('error', {
          message: 'Invalid server JSON',
        });
      }
    });

    socket.addEventListener('close', (event) => {
      if (this.socket !== socket) return;

      this.socket = null;

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

  join(roomId, name) {
    this.joinData = {
      type: 'join',
      roomId,
      name,
    };

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(this.joinData));
    }
  }

  send(message) {
    const data = JSON.stringify(message);

    if (this.socket?.readyState === WebSocket.OPEN) {
      // Поки сервер не підтвердив вхід,
      // повідомлення залишаються в черзі.
      if (this.joinData && !this.joined) {
        this.enqueue(data);
        return;
      }

      this.socket.send(data);
      return;
    }

    this.enqueue(data);
  }

  enqueue(data) {
    if (this.queue.length >= 100) {
      this.queue.shift();
    }

    this.queue.push(data);
  }

  flushQueue() {
    while (
      this.queue.length > 0 &&
      this.socket?.readyState === WebSocket.OPEN
    ) {
      this.socket.send(this.queue.shift());
    }
  }

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

  disconnect() {
    this.shouldReconnect = false;
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
