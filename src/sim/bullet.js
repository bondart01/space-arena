import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Bullet extends Entity {
  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    ownerId = null,
    ttl = 1.5,
    damage = 25,
    homing = null,
  } = {}) {
    super({
      position,
      velocity,
      radius: 4,
      kind: 'bullet',
    });

    this.ownerId = ownerId;
    this.ttl = ttl;
    this.damage = damage;

    // Homing додається композицією
    this.homing = homing;
  }

  update(dt, world) {
    if (this.homing && world) {
      this.homing.update(this, world, dt);
    }

    super.update(dt);

    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }
}
