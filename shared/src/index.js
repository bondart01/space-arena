
export const TICK_RATE = 30;
export const FIXED_DT = 1 / TICK_RATE;

export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;

export const SHIP_RADIUS = 16;
export const SHIP_ACCELERATION = 320;
export const SHIP_MAX_SPEED = 260;
export const SHIP_TURN_SPEED = 3.5;
export const SHIP_DRAG = 0.985;

export const BULLET_SPEED = 520;
export const BULLET_LIFETIME = 1.2;
export const SHOOT_COOLDOWN = 0.2;

// Генератор псевдовипадкових чисел із seed.
// За однакового seed результат завжди однаковий.
export function createRandom(seed) {
  let state = seed >>> 0;

  return function random() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Початковий стан корабля.
export function createShip(id, x, y, angle = 0) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    angle,
    alive: true,
    health: 100,
    score: 0,
    shootCooldown: 0,
  };
}

// Початковий стан світу.
export function createWorld(seed = 12345) {
  return {
    tick: 0,
    seed: seed >>> 0,
    ships: {},
    bullets: [],
    nextBulletId: 1,
  };
}

// Нормалізація команд керування.
export function normalizeInput(input = {}) {
  return {
    seq: Number.isSafeInteger(input.seq) && input.seq >= 0
      ? input.seq
      : 0,
    thrust: Boolean(input.thrust),
    left: Boolean(input.left),
    right: Boolean(input.right),
    shoot: Boolean(input.shoot),
  };
}

// Обмеження швидкості корабля.
function limitSpeed(ship) {
  const speed = Math.hypot(ship.vx, ship.vy);

  if (speed > SHIP_MAX_SPEED) {
    const factor = SHIP_MAX_SPEED / speed;
    ship.vx *= factor;
    ship.vy *= factor;
  }
}

// Перехід через межі ігрового поля.
function wrapPosition(entity) {
  entity.x =
    ((entity.x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;

  entity.y =
    ((entity.y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
}

// Один крок фізики корабля.
// Цю функцію використовуватимуть сервер і клієнт.
export function integrateShip(ship, rawInput, dt = FIXED_DT) {
  const input = normalizeInput(rawInput);

  if (!ship.alive) {
    return ship;
  }

  if (input.left) {
    ship.angle -= SHIP_TURN_SPEED * dt;
  }

  if (input.right) {
    ship.angle += SHIP_TURN_SPEED * dt;
  }

  if (input.thrust) {
    ship.vx += Math.cos(ship.angle) * SHIP_ACCELERATION * dt;
    ship.vy += Math.sin(ship.angle) * SHIP_ACCELERATION * dt;
  }

  ship.vx *= SHIP_DRAG;
  ship.vy *= SHIP_DRAG;

  limitSpeed(ship);

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  wrapPosition(ship);

  ship.shootCooldown = Math.max(
    0,
    ship.shootCooldown - dt,
  );

  return ship;
}

// Створення кулі.
export function createBullet(world, ship) {
  const bullet = {
    id: world.nextBulletId++,
    ownerId: ship.id,
    x: ship.x + Math.cos(ship.angle) * SHIP_RADIUS,
    y: ship.y + Math.sin(ship.angle) * SHIP_RADIUS,
    vx: ship.vx + Math.cos(ship.angle) * BULLET_SPEED,
    vy: ship.vy + Math.sin(ship.angle) * BULLET_SPEED,
    lifetime: BULLET_LIFETIME,
  };

  world.bullets.push(bullet);
  return bullet;
}

// Оновлення куль.
export function integrateBullets(world, dt = FIXED_DT) {
  for (const bullet of world.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.lifetime -= dt;

    wrapPosition(bullet);
  }

  world.bullets = world.bullets.filter(
    (bullet) => bullet.lifetime > 0,
  );
}

// Один фіксований крок усього світу.
export function stepWorld(world, inputs = {}, dt = FIXED_DT) {
  const shipIds = Object.keys(world.ships).sort();

  for (const shipId of shipIds) {
    const ship = world.ships[shipId];
    const input = normalizeInput(inputs[shipId]);

    integrateShip(ship, input, dt);

    if (
      input.shoot &&
      ship.alive &&
      ship.shootCooldown <= 0
    ) {
      createBullet(world, ship);
      ship.shootCooldown = SHOOT_COOLDOWN;
    }
  }

  integrateBullets(world, dt);

  world.tick += 1;

  return world;
}

// Копія стану світу для мережевого знімка.
export function createSnapshot(world) {
  return {
    tick: world.tick,
    seed: world.seed,
    ships: Object.fromEntries(
      Object.entries(world.ships).map(([id, ship]) => [
        id,
        { ...ship },
      ]),
    ),
    bullets: world.bullets.map((bullet) => ({ ...bullet })),
  };
}
