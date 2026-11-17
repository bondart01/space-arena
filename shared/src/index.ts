export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type PlayerId = Brand<string, 'PlayerId'>;
export type BulletId = Brand<number, 'BulletId'>;
export type Tick = Brand<number, 'Tick'>;
export type InputSeq = Brand<number, 'InputSeq'>;
export interface Vector2 { readonly x: number; readonly y: number }
export interface Ship { id: string; x: number; y: number; vx: number; vy: number; angle: number; alive: boolean; health: number; score: number; shootCooldown: number }
export interface Bullet { id: number; ownerId: string; x: number; y: number; vx: number; vy: number; lifetime: number }
export interface Asteroid { id: number; x: number; y: number; vx: number; vy: number; radius: number; health: number }
export interface Pickup { id: number; x: number; y: number; radius: number; kind: 'health' | 'points' }
export interface World { tick: number; seed: number; ships: Record<string, Ship>; bullets: Bullet[]; nextBulletId: number; asteroids: Asteroid[]; pickups: Pickup[]; nextAsteroidId: number; nextPickupId: number }
export interface Input { seq: number; thrust: boolean; left: boolean; right: boolean; shoot: boolean }
export type SnapshotEntity = ({ readonly kind: 'ship' } & Readonly<Ship>) | ({ readonly kind: 'bullet' } & Readonly<Bullet>);
export function assertNever(value: never): never { throw new Error(`Unhandled variant: ${String(value)}`); }
export function describeEntity(entity: SnapshotEntity): string {
  switch (entity.kind) {
    case 'ship': return `Ship ${entity.id}`;
    case 'bullet': return `Bullet ${entity.id}`;
    default: return assertNever(entity);
  }
}
export function asPlayerId(value: string): PlayerId { return value as PlayerId; /* branded ID: validated at boundary */ }
export function asInputSeq(value: number): InputSeq { if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid seq'); return value as InputSeq; /* branded seq after validation */ }
export function asTick(value: number): Tick { if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid tick'); return value as Tick; /* branded tick after validation */ }


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

// Р“РµРЅРµСЂР°С‚РѕСЂ РїСЃРµРІРґРѕРІРёРїР°РґРєРѕРІРёС… С‡РёСЃРµР» С–Р· seed.
// Р—Р° РѕРґРЅР°РєРѕРІРѕРіРѕ seed СЂРµР·СѓР»СЊС‚Р°С‚ Р·Р°РІР¶РґРё РѕРґРЅР°РєРѕРІРёР№.
export function createRandom(seed: number) {
  let state = seed >>> 0;

  return function random() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// РџРѕС‡Р°С‚РєРѕРІРёР№ СЃС‚Р°РЅ РєРѕСЂР°Р±Р»СЏ.
export function createShip(id: string, x: number, y: number, angle = 0): Ship {
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

// РџРѕС‡Р°С‚РєРѕРІРёР№ СЃС‚Р°РЅ СЃРІС–С‚Сѓ.
export function createWorld(seed = 12345): World {
  return {
    tick: 0,
    seed: seed >>> 0,
    ships: {},
    bullets: [],
    nextBulletId: 1,
    asteroids: Array.from({ length: 7 }, (_, i): Asteroid => {
      const random = createRandom((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
      return { id: i + 1, x: 60 + random() * (WORLD_WIDTH - 120), y: 60 + random() * (WORLD_HEIGHT - 120), vx: (random() - .5) * 55, vy: (random() - .5) * 55, radius: 17 + random() * 14, health: 2 };
    }),
    pickups: [],
    nextAsteroidId: 8,
    nextPickupId: 1,
  };
}

// РќРѕСЂРјР°Р»С–Р·Р°С†С–СЏ РєРѕРјР°РЅРґ РєРµСЂСѓРІР°РЅРЅСЏ.
export function normalizeInput(input: Partial<Input> = {}): Input {
  return {
    seq: typeof input.seq === 'number' && Number.isSafeInteger(input.seq) && input.seq >= 0
      ? input.seq
      : 0,
    thrust: Boolean(input.thrust),
    left: Boolean(input.left),
    right: Boolean(input.right),
    shoot: Boolean(input.shoot),
  };
}

// РћР±РјРµР¶РµРЅРЅСЏ С€РІРёРґРєРѕСЃС‚С– РєРѕСЂР°Р±Р»СЏ.
function limitSpeed(ship: Ship) {
  const speed = Math.hypot(ship.vx, ship.vy);

  if (speed > SHIP_MAX_SPEED) {
    const factor = SHIP_MAX_SPEED / speed;
    ship.vx *= factor;
    ship.vy *= factor;
  }
}

// РџРµСЂРµС…С–Рґ С‡РµСЂРµР· РјРµР¶С– С–РіСЂРѕРІРѕРіРѕ РїРѕР»СЏ.
function wrapPosition(entity: Ship | Bullet) {
  entity.x =
    ((entity.x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;

  entity.y =
    ((entity.y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
}

// РћРґРёРЅ РєСЂРѕРє С„С–Р·РёРєРё РєРѕСЂР°Р±Р»СЏ.
// Р¦СЋ С„СѓРЅРєС†С–СЋ РІРёРєРѕСЂРёСЃС‚РѕРІСѓРІР°С‚РёРјСѓС‚СЊ СЃРµСЂРІРµСЂ С– РєР»С–С”РЅС‚.
export function integrateShip(ship: Ship, rawInput: Partial<Input>, dt = FIXED_DT): Ship {
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

// РЎС‚РІРѕСЂРµРЅРЅСЏ РєСѓР»С–.
export function createBullet(world: World, ship: Ship): Bullet {
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

// РћРЅРѕРІР»РµРЅРЅСЏ РєСѓР»СЊ.
export function integrateBullets(world: World, dt = FIXED_DT): void {
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

// Server-authoritative, deterministic asteroid and pickup simulation.
function distanceSquared(a: {x:number;y:number}, b: {x:number;y:number}): number {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  return Math.min(dx, WORLD_WIDTH - dx) ** 2 + Math.min(dy, WORLD_HEIGHT - dy) ** 2;
}
function spawnAsteroid(world: World): Asteroid {
  const id = world.nextAsteroidId++;
  const random = createRandom((world.seed ^ Math.imul(id, 0x9e3779b1)) >>> 0);
  return { id, x: 40 + random() * (WORLD_WIDTH - 80), y: 40 + random() * (WORLD_HEIGHT - 80), vx: (random() - .5) * 65, vy: (random() - .5) * 65, radius: 18 + random() * 12, health: 2 };
}
function stepObstacles(world: World, dt: number): void {
  for (const asteroid of world.asteroids) {
    asteroid.x = (asteroid.x + asteroid.vx * dt + WORLD_WIDTH) % WORLD_WIDTH;
    asteroid.y = (asteroid.y + asteroid.vy * dt + WORLD_HEIGHT) % WORLD_HEIGHT;
  }
  const removed = new Set<number>();
  const consumedBullets = new Set<number>();
  for (const bullet of world.bullets) {
    for (const asteroid of world.asteroids) {
      if (removed.has(asteroid.id) || consumedBullets.has(bullet.id)) continue;
      if (distanceSquared(bullet, asteroid) > (asteroid.radius + 4) ** 2) continue;
      consumedBullets.add(bullet.id);
      asteroid.health--;
      if (asteroid.health <= 0) {
        removed.add(asteroid.id);
        const owner = world.ships[bullet.ownerId];
        if (owner) owner.score += 100;
        if (asteroid.id % 3 === 0) {
          world.pickups.push({ id: world.nextPickupId++, x: asteroid.x, y: asteroid.y, radius: 13, kind: asteroid.id % 2 ? 'health' : 'points' });
        }
      }
    }
  }
  world.bullets = world.bullets.filter(b => !consumedBullets.has(b.id));
  world.asteroids = world.asteroids.filter(a => !removed.has(a.id));
  for (const ship of Object.values(world.ships)) {
    if (!ship.alive) continue;
    for (const asteroid of world.asteroids) {
      if (distanceSquared(ship, asteroid) < (SHIP_RADIUS + asteroid.radius) ** 2 && world.tick % 15 === 0) {
        ship.health = Math.max(0, ship.health - 5);
        if (ship.health === 0) ship.alive = false;
      }
    }
  }
  const taken = new Set<number>();
  for (const pickup of world.pickups) {
    for (const ship of Object.values(world.ships)) {
      if (!ship.alive || distanceSquared(ship, pickup) > (SHIP_RADIUS + pickup.radius) ** 2) continue;
      if (pickup.kind === 'health') ship.health = Math.min(100, ship.health + 25);
      else ship.score += 50;
      taken.add(pickup.id);
      break;
    }
  }
  world.pickups = world.pickups.filter(p => !taken.has(p.id));
  while (world.asteroids.length < 7) world.asteroids.push(spawnAsteroid(world));
}

// РћРґРёРЅ С„С–РєСЃРѕРІР°РЅРёР№ РєСЂРѕРє СѓСЃСЊРѕРіРѕ СЃРІС–С‚Сѓ.
export function stepWorld(world: World, inputs: Record<string, Partial<Input>> = {}, dt = FIXED_DT): World {
  const shipIds = Object.keys(world.ships).sort();

  for (const shipId of shipIds) {
    const ship = world.ships[shipId];
    if (!ship) continue;
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
  stepObstacles(world, dt);

  world.tick += 1;

  return world;
}

// РљРѕРїС–СЏ СЃС‚Р°РЅСѓ СЃРІС–С‚Сѓ РґР»СЏ РјРµСЂРµР¶РµРІРѕРіРѕ Р·РЅС–РјРєР°.
export function createSnapshot(world: World) {
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
    asteroids: world.asteroids.map((asteroid) => ({ ...asteroid })),
    pickups: world.pickups.map((pickup) => ({ ...pickup })),
  };
}

