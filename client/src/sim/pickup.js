import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Pickup extends Entity {
  constructor({ position = new Vector2(), healAmount = 30 } = {}) {
    super({
      position,
      velocity: new Vector2(),
      radius: 13,
      kind: 'pickup',
    });

    this.healAmount = healAmount;
  }

  update() {
    // Бонус залишається нерухомим
  }

  collect(ship) {
    if (!this.alive || !ship.alive) {
      return;
    }

    ship.heal(this.healAmount);
    this.destroy();
  }
}
