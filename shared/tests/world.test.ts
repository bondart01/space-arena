import { describe, expect, it } from 'vitest';
import {
  createWorld,
  createShip,
  createRandom,
  normalizeInput,
  integrateShip,
  createBullet,
  integrateBullets,
  stepWorld,
  createSnapshot,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  SHIP_MAX_SPEED,
  FIXED_DT,
} from '../src/index.ts';

const idle = {
  seq: 1,
  thrust: false,
  left: false,
  right: false,
  shoot: false,
};

describe('Shared world simulation', () => {
  it('creates world with tick zero', () => {
    expect(createWorld().tick).toBe(0);
  });

  it('creates seven asteroids', () => {
    expect(createWorld().asteroids).toHaveLength(7);
  });

  it('creates identical worlds for the same seed', () => {
    expect(createWorld(123)).toEqual(createWorld(123));
  });

  it('creates different asteroid layouts for different seeds', () => {
    expect(createWorld(123).asteroids)
      .not.toEqual(createWorld(456).asteroids);
  });

  it('generates deterministic random numbers', () => {
    const a = createRandom(42);
    const b = createRandom(42);

    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('normalizes empty input', () => {
    expect(normalizeInput()).toEqual({
      seq: 0,
      thrust: false,
      left: false,
      right: false,
      shoot: false,
    });
  });

  it('creates ship with full health', () => {
    const ship = createShip('player1', 100, 200);

    expect(ship.health).toBe(100);
    expect(ship.alive).toBe(true);
    expect(ship.x).toBe(100);
    expect(ship.y).toBe(200);
  });

  it('moves ship with thrust', () => {
    const ship = createShip('player1', 100, 100);

    integrateShip(ship, { ...idle, thrust: true });

    expect(ship.vx).toBeGreaterThan(0);
    expect(ship.x).toBeGreaterThan(100);
  });

  it('does not move dead ship', () => {
    const ship = createShip('player1', 100, 100);
    ship.alive = false;

    const before = { ...ship };

    integrateShip(ship, { ...idle, thrust: true });

    expect(ship).toEqual(before);
  });

  it('limits ship speed', () => {
    const ship = createShip('player1', 100, 100);
    ship.vx = 1000;
    ship.vy = 1000;

    integrateShip(ship, idle);

    expect(Math.hypot(ship.vx, ship.vy))
      .toBeLessThan(SHIP_MAX_SPEED + 0.000001);
  });

  it('keeps ship inside arena', () => {
    const ship = createShip('player1', WORLD_WIDTH - 1, 100);
    ship.vx = 200;

    integrateShip(ship, idle);

    expect(ship.x).toBeGreaterThanOrEqual(0);
    expect(ship.x).toBeLessThan(WORLD_WIDTH);
    expect(ship.y).toBeGreaterThanOrEqual(0);
    expect(ship.y).toBeLessThan(WORLD_HEIGHT);
  });

  it('creates bullet with correct owner', () => {
    const world = createWorld();
    const ship = createShip('player1', 100, 100);

    const bullet = createBullet(world, ship);

    expect(bullet.ownerId).toBe('player1');
    expect(world.bullets).toHaveLength(1);
    expect(bullet.id).toBe(1);
  });

  it('removes expired bullets', () => {
    const world = createWorld();
    const ship = createShip('player1', 100, 100);

    const bullet = createBullet(world, ship);
    bullet.lifetime = 0.01;

    integrateBullets(world, FIXED_DT);

    expect(world.bullets).toHaveLength(0);
  });

  it('increments tick after world step', () => {
    const world = createWorld();

    stepWorld(world);

    expect(world.tick).toBe(1);
  });

  it('produces identical states for identical inputs', () => {
    const a = createWorld(42);
    const b = createWorld(42);

    a.ships.player1 = createShip('player1', 100, 100);
    b.ships.player1 = createShip('player1', 100, 100);

    for (let i = 0; i < 120; i++) {
      const input = {
        ...idle,
        seq: i + 1,
        thrust: i % 3 === 0,
        left: i % 5 === 0,
        shoot: i % 10 === 0,
      };

      stepWorld(a, { player1: input });
      stepWorld(b, { player1: input });
    }

    expect(createSnapshot(a)).toEqual(createSnapshot(b));
  });

  it('creates snapshot independent of original ship objects', () => {
    const world = createWorld();
    world.ships.player1 = createShip('player1', 100, 100);

    const snapshot = createSnapshot(world);

    world.ships.player1.x = 500;

    expect(snapshot.ships.player1.x).toBe(100);
  });
});
