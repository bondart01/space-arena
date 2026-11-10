import { createExplosion } from './particles.js';

export function circlesCollide(a, b) {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const radiusSum = a.radius + b.radius;

  return dx * dx + dy * dy <= radiusSum * radiusSum;
}

export function handleCollisions(world) {
  const entities = [...world];

  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];

    if (!a.alive) continue;

    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];

      if (!b.alive) continue;
      if (!circlesCollide(a, b)) continue;

      resolveCollision(a, b, world);
    }
  }
}

function resolveCollision(a, b, world) {
  // Куля влучає у ціль
  if (a.kind === 'bullet') {
    handleBulletHit(a, b, world);
    return;
  }

  if (b.kind === 'bullet') {
    handleBulletHit(b, a, world);
    return;
  }

  // Корабель збирає бонус
  if ((a.kind === 'ship' && b.kind === 'pickup') || (a.kind === 'pickup' && b.kind === 'ship')) {
    const ship = a.kind === 'ship' ? a : b;
    const pickup = a.kind === 'pickup' ? a : b;

    pickup.collect(ship);
    return;
  }

  // Корабель стикається з астероїдом
  if (
    (a.kind === 'ship' && b.kind === 'asteroid') ||
    (a.kind === 'asteroid' && b.kind === 'ship')
  ) {
    const ship = a.kind === 'ship' ? a : b;
    const asteroid = a.kind === 'asteroid' ? a : b;

    ship.damage(20);
    asteroid.damage(10);

    if (!ship.alive) {
      createExplosion(world, ship.position, 25);
    }

    if (!asteroid.alive) {
      createExplosion(world, asteroid.position, 18);
    }
  }
}

function handleBulletHit(bullet, target, world) {
  if (bullet.ownerId === target.id) return;

  if (target.kind !== 'ship' && target.kind !== 'asteroid') {
    return;
  }

  target.damage(bullet.damage);
  bullet.destroy();

  if (!target.alive) {
    createExplosion(world, target.position, 20);

    const owner = world.get(bullet.ownerId);

    if (owner && owner.kind === 'ship') {
      owner.score += 100;
    }
  }
}
