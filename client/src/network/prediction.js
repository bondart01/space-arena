
import {
  FIXED_DT,
  integrateShip,
  normalizeInput,
} from '@space-arena/shared';

const MAX_INPUT_HISTORY = 256;

export class ClientPrediction {
  constructor() {
    this.ship = null;
    this.pendingInputs = [];

    this.lastAck = 0;
    this.lastCorrection = 0;
  }

  // Початковий стан власного корабля
  initialize(serverShip) {
    this.ship = { ...serverShip };
    this.pendingInputs = [];

    this.lastAck = 0;
    this.lastCorrection = 0;
  }

  // Локальне передбачення одного кроку
  predict(rawInput) {
    if (!this.ship) return;

    const input = normalizeInput(rawInput);

    this.pendingInputs.push(input);

    integrateShip(this.ship, input, FIXED_DT);

    if (this.pendingInputs.length > MAX_INPUT_HISTORY) {
      this.pendingInputs.shift();
    }
  }

  // Звіряння із серверним станом
  reconcile(serverShip, ack) {
    if (!serverShip || !this.ship) return;

    // Не застосовуємо старі підтвердження
    if (ack < this.lastAck) return;

    const previousX = this.ship.x;
    const previousY = this.ship.y;

    // Відновлюємо авторитетний стан
    this.ship = { ...serverShip };

    // Видаляємо підтверджені команди
    this.pendingInputs = this.pendingInputs.filter(
      (input) => input.seq > ack,
    );

    // Повторно застосовуємо непідтверджені
    for (const input of this.pendingInputs) {
      integrateShip(this.ship, input, FIXED_DT);
    }

    this.lastAck = ack;

    // Величина корекції координат
    this.lastCorrection = Math.hypot(
      this.ship.x - previousX,
      this.ship.y - previousY,
    );
  }

  // Поточний передбачений стан
  getShip() {
    return this.ship;
  }

  // Кількість команд без ACK
  getPendingCount() {
    return this.pendingInputs.length;
  }

  // Остання корекція в пікселях
  getCorrection() {
    return this.lastCorrection;
  }
}
