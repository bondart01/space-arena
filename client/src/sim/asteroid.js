import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Asteroid extends Entity {
  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    radius = 25,
    hp = 50,
    homing = null,
  } = {}) {
    super({
      position,
      velocity,
      radius,
      kind: 'asteroid',
    });

    this.hp = hp;
    this.homing = homing;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 2;
  }

  update(dt, world) {
    if (this.homing && world) {
      this.homing.update(this, world, dt);
    }

    super.update(dt);

    this.rotation += this.rotationSpeed * dt;
  }

  damage(amount) {
    this.hp = Math.max(0, this.hp - amount);

    if (this.hp === 0) {
      this.destroy();
    }
  }
}
