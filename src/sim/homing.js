
export class Homing {
  constructor({
    targetId,
    strength = 180,
    maxSpeed = 250,
  } = {}) {
    this.targetId = targetId;
    this.strength = strength;
    this.maxSpeed = maxSpeed;
  }

  update(entity, world, dt) {
    const target = world.get(this.targetId);

    if (!target || !target.alive) {
      return;
    }

    const direction = target.position
      .sub(entity.position)
      .normalize();

    entity.velocity = entity.velocity.add(
      direction.scale(this.strength * dt),
    );

    const speed = entity.velocity.length();

    if (speed > this.maxSpeed) {
      entity.velocity = entity.velocity
        .normalize()
        .scale(this.maxSpeed);
    }
  }
}
