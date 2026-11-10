import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export class Ship extends Entity {
  #hp = 100;

  constructor({ position = new Vector2(480, 270), angle = -Math.PI / 2 } = {}) {
    super({
      position,
      velocity: new Vector2(),
      radius: 16,
      kind: 'ship',
    });

    this.angle = angle;
    this.score = 0;
    this.cooldown = 0;
  }

  get hp() {
    return this.#hp;
  }

  update(dt, input = {}) {
    const acceleration = 240;
    const rotationSpeed = 3.5;
    const drag = 0.4;
    const maxSpeed = 350;

    if (input.left) {
      this.angle -= rotationSpeed * dt;
    }

    if (input.right) {
      this.angle += rotationSpeed * dt;
    }

    if (input.thrust) {
      const direction = Vector2.fromAngle(this.angle);

      this.velocity = this.velocity.add(direction.scale(acceleration * dt));
    }

    this.velocity = this.velocity.scale(Math.exp(-drag * dt));

    const speed = this.velocity.length();

    if (speed > maxSpeed) {
      this.velocity = this.velocity.normalize().scale(maxSpeed);
    }

    super.update(dt);

    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  damage(amount) {
    this.#hp = Math.max(0, this.#hp - amount);

    if (this.#hp === 0) {
      this.destroy();
    }
  }

  heal(amount) {
    this.#hp = Math.min(100, this.#hp + amount);
  }

  respawn(position = new Vector2(480, 270)) {
    this.position = position;
    this.velocity = new Vector2();
    this.angle = -Math.PI / 2;
    this.#hp = 100;
    this.alive = true;
    this.cooldown = 0;
  }

  fire() {
    if (!this.alive || this.cooldown > 0) {
      return null;
    }

    this.cooldown = 0.2;

    const direction = Vector2.fromAngle(this.angle);

    return {
      position: this.position.add(direction.scale(this.radius + 8)),
      velocity: this.velocity.add(direction.scale(500)),
      ownerId: this.id,
    };
  }
}
