import { Vector2 } from './vector.js';

export class Entity {
  static #nextId = 1;

  constructor({
    position = new Vector2(),
    velocity = new Vector2(),
    radius = 10,
    kind = 'entity',
  } = {}) {
    this.id = Entity.#nextId++;

    this.position = position;
    this.velocity = velocity;
    this.radius = radius;
    this.kind = kind;
    this.alive = true;
  }

  update(dt) {
    this.position = this.position.add(this.velocity.scale(dt));
  }

  destroy() {
    this.alive = false;
  }
}
