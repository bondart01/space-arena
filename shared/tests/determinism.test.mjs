import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, createShip, createSnapshot, stepWorld } from '../dist/index.js';

function simulate(seed) {
  const world = createWorld(seed);
  world.ships.alpha = createShip('alpha', 240, 270, 0);
  world.ships.beta = createShip('beta', 720, 270, Math.PI);
  for (let tick = 1; tick <= 600; tick++) {
    stepWorld(world, {
      alpha: { seq: tick, thrust: tick % 3 !== 0, left: tick % 11 === 0, right: false, shoot: tick % 7 === 0 },
      beta: { seq: tick, thrust: tick % 5 !== 0, left: false, right: tick % 13 === 0, shoot: tick % 9 === 0 },
    });
  }
  return createSnapshot(world);
}

test('same seed and inputs produce identical world snapshots', () => {
  assert.deepStrictEqual(simulate(12345), simulate(12345));
});

test('different seeds create different deterministic obstacle layouts', () => {
  const a = simulate(12345);
  const b = simulate(54321);
  assert.equal(a.tick, b.tick);
  assert.notEqual(a.seed, b.seed);
  assert.equal(Object.keys(a.ships).length, Object.keys(b.ships).length);
  assert.equal(a.asteroids.length, 7);
  assert.equal(b.asteroids.length, 7);
  assert.notDeepStrictEqual(a.asteroids, b.asteroids);
});
