import { handleCollisions } from './collision.js';

export class World {
  constructor() {
    this.entities = new Map();
    this.pendingRemoval = new Set();
    this.input = {};
  }

  spawn(entity) {
    this.entities.set(entity.id, entity);
    return entity;
  }

  despawn(id) {
    const entity = this.entities.get(id);

    if (entity) {
      entity.destroy();
      this.pendingRemoval.add(id);
    }
  }

  get(id) {
    return this.entities.get(id);
  }

  *ofKind(kind) {
    for (const entity of this.entities.values()) {
      if (entity.alive && entity.kind === kind) {
        yield entity;
      }
    }
  }

  *[Symbol.iterator]() {
    for (const entity of this.entities.values()) {
      if (entity.alive) {
        yield entity;
      }
    }
  }

  step(dt) {
    const currentEntities = [...this.entities.values()];

    for (const entity of currentEntities) {
      if (!entity.alive) continue;

      if (entity.kind === 'ship') {
        entity.update(dt, this.input);
      } else {
        entity.update(dt, this);
      }
    }

    handleCollisions(this);
    this.sweep();
  }

  sweep() {
    for (const entity of this.entities.values()) {
      if (!entity.alive) {
        this.pendingRemoval.add(entity.id);
      }
    }

    for (const id of this.pendingRemoval) {
      this.entities.delete(id);
    }

    this.pendingRemoval.clear();
  }

  get size() {
    return this.entities.size;
  }
}
