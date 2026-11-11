
import {
  FIXED_DT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  integrateShip,
  normalizeInput,
} from '@space-arena/shared';

const MAX_INPUT_HISTORY = 256;

// Відстань між координатами з урахуванням
// переходу через межі ігрового поля.
function wrappedDistance(a, b, size) {
  const distance = Math.abs(a - b) % size;

  return Math.min(
    distance,
    size - distance,
  );
}

export class ClientPrediction {
  constructor() {
    this.ship = null;
    this.pendingInputs = [];

    this.lastAck = 0;
    this.lastCorrection = 0;
  }

  // Початковий авторитетний стан корабля.
  initialize(serverShip, ack = 0) {
    if (!serverShip) {
      return;
    }

    this.ship = { ...serverShip };
    this.pendingInputs = [];

    this.lastAck = ack;
    this.lastCorrection = 0;
  }

  // Локальне прогнозування руху корабля.
  predict(rawInput) {
    if (!this.ship) {
      return;
    }

    const input = normalizeInput(rawInput);

    // Не обробляємо вже підтверджені команди.
    if (
      input.seq <= this.lastAck ||
      this.pendingInputs.some(
        (pending) => pending.seq === input.seq,
      )
    ) {
      return;
    }

    this.pendingInputs.push(input);

    // Негайно змінюємо локальний стан корабля.
    integrateShip(
      this.ship,
      input,
      FIXED_DT,
    );

    // Обмежуємо історію команд.
    if (
      this.pendingInputs.length >
      MAX_INPUT_HISTORY
    ) {
      this.pendingInputs.shift();
    }
  }

  // Звіряння прогнозу із серверним станом.
  reconcile(serverShip, ack) {
    if (!serverShip || !this.ship) {
      return;
    }

    // Захист від некоректних або старих ACK.
    if (
      !Number.isSafeInteger(ack) ||
      ack < this.lastAck
    ) {
      return;
    }

    const previousShip = { ...this.ship };

    // Відновлюємо авторитетний стан сервера.
    this.ship = { ...serverShip };

    // Видаляємо всі підтверджені команди.
    this.pendingInputs =
      this.pendingInputs.filter(
        (input) => input.seq > ack,
      );

    // Повторно застосовуємо лише команди,
    // які сервер ще не підтвердив.
    for (const input of this.pendingInputs) {
      integrateShip(
        this.ship,
        input,
        FIXED_DT,
      );
    }

    this.lastAck = ack;

    // Вимірюємо величину корекції.
    const dx = wrappedDistance(
      this.ship.x,
      previousShip.x,
      WORLD_WIDTH,
    );

    const dy = wrappedDistance(
      this.ship.y,
      previousShip.y,
      WORLD_HEIGHT,
    );

    this.lastCorrection = Math.hypot(
      dx,
      dy,
    );
  }

  // Поточний прогнозований стан корабля.
  getShip() {
    return this.ship;
  }

  // Кількість непідтверджених команд.
  getPendingCount() {
    return this.pendingInputs.length;
  }

  // Остання корекція координат у пікселях.
  getCorrection() {
    return this.lastCorrection;
  }

  // Останній підтверджений номер команди.
  getLastAck() {
    return this.lastAck;
  }

  // Скидання стану при виході з кімнати.
  reset() {
    this.ship = null;
    this.pendingInputs = [];

    this.lastAck = 0;
    this.lastCorrection = 0;
  }
}
