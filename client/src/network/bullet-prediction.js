
import {
  FIXED_DT,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SHIP_RADIUS,
  BULLET_SPEED,
  BULLET_LIFETIME,
  SHOOT_COOLDOWN,
} from '@space-arena/shared';

function wrap(value, size) {
  return ((value % size) + size) % size;
}

export class BulletPrediction {
  constructor() {
    this.bullets = [];
    this.nextLocalId = -1;
    this.lastShotTime = -Infinity;
  }

  shoot(ship, input, now = performance.now()) {
    if (!ship || !ship.alive || !input.shoot) {
      return null;
    }

    const cooldownMs = SHOOT_COOLDOWN * 1000;

    if (now - this.lastShotTime < cooldownMs) {
      return null;
    }

    this.lastShotTime = now;

    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);

    const bullet = {
      id: this.nextLocalId--,
      ownerId: ship.id,
      x: wrap(
        ship.x + cos * SHIP_RADIUS,
        WORLD_WIDTH,
      ),
      y: wrap(
        ship.y + sin * SHIP_RADIUS,
        WORLD_HEIGHT,
      ),
      vx: ship.vx + cos * BULLET_SPEED,
      vy: ship.vy + sin * BULLET_SPEED,
      lifetime: BULLET_LIFETIME,
      predicted: true,
      inputSeq: input.seq,
    };

    this.bullets.push(bullet);

    return bullet;
  }

  update(dt = FIXED_DT) {
    for (const bullet of this.bullets) {
      bullet.x = wrap(
        bullet.x + bullet.vx * dt,
        WORLD_WIDTH,
      );

      bullet.y = wrap(
        bullet.y + bullet.vy * dt,
        WORLD_HEIGHT,
      );

      bullet.lifetime -= dt;
    }

    this.bullets = this.bullets.filter(
      (bullet) => bullet.lifetime > 0,
    );
  }

  reconcile(serverBullets, localPlayerId, ack) {
    if (!Array.isArray(serverBullets)) {
      return;
    }

    const hasServerBullet = serverBullets.some(
      (bullet) => bullet.ownerId === localPlayerId,
    );

    if (!hasServerBullet) {
      return;
    }

    this.bullets = this.bullets.filter(
      (bullet) => bullet.inputSeq > ack,
    );
  }

  getBullets() {
    return this.bullets;
  }

  reset() {
    this.bullets = [];
    this.nextLocalId = -1;
    this.lastShotTime = -Infinity;
  }
}
