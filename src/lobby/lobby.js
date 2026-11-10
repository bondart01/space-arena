
/* global EventTarget, CustomEvent, AbortController, AbortSignal, setInterval, clearInterval, fetch */

export class Lobby extends EventTarget {
  constructor({
    roomsUrl = '/api/rooms.json',
    refreshInterval = 5000,
    requestTimeout = 3000,
  } = {}) {
    super();

    this.roomsUrl = roomsUrl;
    this.refreshInterval = refreshInterval;
    this.requestTimeout = requestTimeout;

    this.rooms = [];
    this.visible = false;

    this.intervalId = null;
    this.controller = null;
  }

  // ========================================
  // АСИНХРОННЕ ОТРИМАННЯ КІМНАТ
  // ========================================

  async fetchRooms() {
    if (!this.visible) return;

    // Скасовуємо попередній запит
    this.controller?.abort();

    const controller = new AbortController();
    this.controller = controller;

    // Таймаут мережевого запиту
    const timeoutSignal = AbortSignal.timeout(
      this.requestTimeout,
    );

    // Об'єднуємо сигнали скасування
    const signal = AbortSignal.any([
      controller.signal,
      timeoutSignal,
    ]);

    try {
      const response = await fetch(
        this.roomsUrl,
        { signal },
      );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`,
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.rooms)) {
        throw new Error(
          'Invalid rooms response',
        );
      }

      if (!this.visible || signal.aborted) {
        return;
      }

      this.rooms = data.rooms;

      // Повідомляємо інтерфейс про оновлення
      this.dispatchEvent(
        new CustomEvent('roomsupdated', {
          detail: {
            rooms: this.rooms,
          },
        }),
      );
    } catch (error) {
      // Ігноруємо скасування при виході з лобі
      if (controller.signal.aborted) return;
      if (!this.visible) return;

      this.dispatchEvent(
        new CustomEvent('roomserror', {
          detail: {
            error,
          },
        }),
      );
    } finally {
      if (this.controller === controller) {
        this.controller = null;
      }
    }
  }

  // ========================================
  // ВІДКРИТТЯ ЛОБІ
  // ========================================

  show() {
    if (this.visible) return;

    this.visible = true;

    this.dispatchEvent(
      new CustomEvent('lobbyshown'),
    );

    // Завантажуємо список кімнат
    this.fetchRooms();

    // Оновлюємо список кожні 5 секунд
    this.intervalId = setInterval(() => {
      this.fetchRooms();
    }, this.refreshInterval);
  }

  // ========================================
  // ЗАКРИТТЯ ЛОБІ
  // ========================================

  hide() {
    if (!this.visible) return;

    this.visible = false;

    // Зупиняємо автоматичне оновлення
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Скасовуємо активний запит
    this.controller?.abort();
    this.controller = null;

    this.dispatchEvent(
      new CustomEvent('lobbyhidden'),
    );
  }

  // ========================================
  // ПРИЄДНАННЯ ДО КІМНАТИ
  // ========================================

  join(playerName, roomId) {
    const name = playerName.trim();

    if (!name) {
      throw new Error(
        'Enter your player name',
      );
    }

    const room = this.rooms.find(
      (item) => item.id === roomId,
    );

    if (!room) {
      throw new Error(
        'Select a valid room',
      );
    }

    this.dispatchEvent(
      new CustomEvent('join', {
        detail: {
          playerName: name,
          room,
        },
      }),
    );

    this.hide();
  }

  // ========================================
  // ОЧИЩЕННЯ РЕСУРСІВ
  // ========================================

  destroy() {
    this.hide();
    this.rooms = [];
  }
}
