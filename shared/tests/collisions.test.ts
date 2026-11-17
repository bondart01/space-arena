import { describe, expect, it } from 'vitest';
import {
  createWorld,
  createShip,
  stepWorld,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '../src/index.ts';

function makeWorld() {
  const world = createWorld(42);
  world.asteroids = [];
  world.pickups = [];
  return world;
}

describe('Shared collisions and pickups', () => {
  it('damages asteroid when bullet hits', () => {
    const world = makeWorld();
    world.asteroids.push({
      id: 1, x: 100, y: 100,
      vx: 0, vy: 0, radius: 20, health: 2,
    });
    world.bullets.push({
      id: 1, ownerId: 'p1',
      x: 100, y: 100,
      vx: 0, vy: 0, lifetime: 1,
    });

    stepWorld(world);

    expect(world.asteroids.find(a => a.id === 1)?.health).toBe(1);
    expect(world.bullets).toHaveLength(0);
  });

  it('awards points for destroying asteroid', () => {
    const world = makeWorld();
    world.ships.p1 = createShip('p1', 500, 400);
    world.asteroids.push({
      id: 1, x: 100, y: 100,
      vx: 0, vy: 0, radius: 20, health: 1,
    });
    world.bullets.push({
      id: 1, ownerId: 'p1',
      x: 100, y: 100,
      vx: 0, vy: 0, lifetime: 1,
    });

    stepWorld(world);

    expect(world.ships.p1.score).toBe(100);
    expect(world.asteroids.some(a => a.id === 1)).toBe(false);
  });

  it('spawns pickup after destroying eligible asteroid', () => {
    const world = makeWorld();
    world.asteroids.push({
      id: 3, x: 100, y: 100,
      vx: 0, vy: 0, radius: 20, health: 1,
    });
    world.bullets.push({
      id: 1, ownerId: 'p1',
      x: 100, y: 100,
      vx: 0, vy: 0, lifetime: 1,
    });

    stepWorld(world);

    expect(world.pickups).toHaveLength(1);
    expect(world.pickups[0].kind).toBe('health');
  });

  it('damages ship on asteroid collision', () => {
    const world = makeWorld();
    world.ships.p1 = createShip('p1', 100, 100);
    world.asteroids.push({
      id: 1, x: 100, y: 100,
      vx: 0, vy: 0, radius: 20, health: 2,
    });

    stepWorld(world);

    expect(world.ships.p1.health).toBe(95);
  });

  it('does not damage ship every tick', () => {
    const world = makeWorld();
    world.ships.p1 = createShip('p1', 100, 100);
    world.tick = 1;
    world.asteroids.push({
      id: 1, x: 100, y: 100,
      vx: 0, vy: 0, radius: 20, health: 2,
    });

    stepWorld(world);

    expect(world.ships.p1.health).toBe(100);
  });

  it('restores health from pickup', () => {
    const world = makeWorld();
    world.ships.p1 = createShip('p1', 100, 100);
    world.ships.p1.health = 50;
    world.pickups.push({
      id: 1, x: 100, y: 100,
      radius: 13, kind: 'health',
    });

    stepWorld(world);

    expect(world.ships.p1.health).toBe(75);
    expect(world.pickups).toHaveLength(0);
  });

  it('does not restore health above 100', () => {
    const world = makeWorld();
    world.ships.p1 = createShip('p1', 100, 100);
    world.ships.p1.health = 95;
    world.pickups.push({
      id: 1, x: 100, y: 100,
      radius: 13, kind: 'health',
    });

    stepWorld(world);

    expect(world.ships.p1.health).toBe(100);
  });

  it('awards points from pickup', () => {
    const world = makeWorld();
    world.ships.p1 = createShip('p1', 100, 100);
    world.pickups.push({
      id: 1, x: 100, y: 100,
      radius: 13, kind: 'points',
    });

    stepWorld(world);

    expect(world.ships.p1.score).toBe(50);
    expect(world.pickups).toHaveLength(0);
  });

  it('ignores pickups for dead ships', () => {
    const world = makeWorld();
    world.ships.p1 = createShip('p1', 100, 100);
    world.ships.p1.alive = false;
    world.pickups.push({
      id: 1, x: 100, y: 100,
      radius: 13, kind: 'points',
    });

    stepWorld(world);

    expect(world.ships.p1.score).toBe(0);
    expect(world.pickups).toHaveLength(1);
  });

  it('restores asteroid population', () => {
    const world = makeWorld();

    stepWorld(world);

    expect(world.asteroids).toHaveLength(7);
  });

  it('detects collision across arena boundary', () => {
    const world = makeWorld();
    world.asteroids.push({
      id: 1, x: WORLD_WIDTH - 2, y: WORLD_HEIGHT / 2,
      vx: 0, vy: 0, radius: 20, health: 2,
    });
    world.bullets.push({
      id: 1, ownerId: 'p1',
      x: 2, y: WORLD_HEIGHT / 2,
      vx: 0, vy: 0, lifetime: 1,
    });

    stepWorld(world);

    expect(world.asteroids.find(a => a.id === 1)?.health).toBe(1);
  });
});
