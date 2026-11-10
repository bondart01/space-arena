import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Particle extends Entity {
  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    ttl = 0.6,
    color = '#ffb347',
    radius = 3,
  } = {}) {
    super({
      position,
      velocity,
      radius,
      kind: 'particle',
    });

    this.ttl = ttl;
    this.maxTtl = ttl;
    this.color = color;
  }

  update(dt) {
    super.update(dt);

    this.ttl -= dt;

    if (this.ttl <= 0) {
      this.destroy();
    }
  }
}

export function createExplosion(world, position, count = 18) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 160;

    world.spawn(
      new Particle({
        position: new Vector2(position.x, position.y),
        velocity: Vector2.fromAngle(angle).scale(speed),
        ttl: 0.3 + Math.random() * 0.6,
        radius: 1 + Math.random() * 3,
        color: Math.random() > 0.5 ? '#ffb347' : '#ff5e57',
      }),
    );
  }
}
