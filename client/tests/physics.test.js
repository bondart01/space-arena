
import { describe, expect, it } from 'vitest';
import { integrate } from '../src/game/physics.js';

const makeShip = () => ({
  x: 100,
  y: 100,
  vx: 0,
  vy: 0,
  angle: 0,
  worldWidth: 960,
  worldHeight: 540,
});

const idle = {
  thrust: false,
  left: false,
  right: false,
};

describe('Client physics', () => {
  it('does not move stationary ship', () => {
    const result = integrate(makeShip(), idle, 1 / 30);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });

  it('rotates left', () => {
    const result = integrate(makeShip(), { ...idle, left: true }, 0.1);
    expect(result.angle).toBeLessThan(0);
  });

  it('rotates right', () => {
    const result = integrate(makeShip(), { ...idle, right: true }, 0.1);
    expect(result.angle).toBeGreaterThan(0);
  });

  it('accelerates with thrust', () => {
    const result = integrate(makeShip(), { ...idle, thrust: true }, 0.1);
    expect(result.vx).toBeGreaterThan(0);
  });

  it('applies drag', () => {
    const ship = { ...makeShip(), vx: 100 };
    const result = integrate(ship, idle, 0.1);
    expect(result.vx).toBeLessThan(100);
  });

  it('limits maximum speed', () => {
    const ship = { ...makeShip(), vx: 1000, vy: 1000 };
    const result = integrate(ship, idle, 0.1);
    expect(Math.hypot(result.vx, result.vy)).toBeCloseTo(350, 5);
  });

  it('wraps right arena boundary', () => {
    const ship = { ...makeShip(), x: 959, vx: 100 };
    const result = integrate(ship, idle, 0.1);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThan(960);
  });

  it('wraps negative arena boundary', () => {
    const ship = { ...makeShip(), x: 1, vx: -100 };
    const result = integrate(ship, idle, 0.1);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThan(960);
  });

  it('preserves original ship object', () => {
    const ship = makeShip();
    integrate(ship, { ...idle, thrust: true }, 0.1);
    expect(ship.vx).toBe(0);
  });

  it('is deterministic for identical inputs', () => {
    const a = integrate(makeShip(), { ...idle, thrust: true }, 1 / 30);
    const b = integrate(makeShip(), { ...idle, thrust: true }, 1 / 30);
    expect(a).toEqual(b);
  });
});
