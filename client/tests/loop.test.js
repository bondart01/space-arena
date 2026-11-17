import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';

import { createLoop } from '../src/game/loop.js';

let callbacks;
let nextId;
let now;

beforeEach(() => {
  callbacks = new Map();
  nextId = 1;
  now = 0;

  vi.stubGlobal('performance', {
    now: () => now,
  });

  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });

  vi.stubGlobal('cancelAnimationFrame', (id) => {
    callbacks.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function advance(ms) {
  now += ms;

  const pending = [...callbacks.values()];
  callbacks.clear();

  for (const callback of pending) {
    callback(now);
  }
}

describe('Game loop', () => {
  it('starts animation loop', () => {
    const loop = createLoop({
      update: vi.fn(),
      render: vi.fn(),
    });

    loop.start();

    expect(callbacks.size).toBe(1);
    loop.stop();
  });

  it('does not start twice', () => {
    const loop = createLoop({
      update: vi.fn(),
      render: vi.fn(),
    });

    loop.start();
    loop.start();

    expect(callbacks.size).toBe(1);
    loop.stop();
  });

  it('renders frames', () => {
    const render = vi.fn();
    const loop = createLoop({
      update: vi.fn(),
      render,
    });

    loop.start();
    advance(40);

    expect(render).toHaveBeenCalled();
    loop.stop();
  });

  it('updates simulation with fixed timestep', () => {
    const update = vi.fn();
    const loop = createLoop({
      update,
      render: vi.fn(),
    });

    loop.start();
    advance(100);

    expect(update).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it('limits accumulated frame time', () => {
    const update = vi.fn();
    const loop = createLoop({
      update,
      render: vi.fn(),
    });

    loop.start();
    advance(1000);

    expect(update.mock.calls.length).toBeLessThanOrEqual(8);
    loop.stop();
  });

  it('stops scheduling animation frames', () => {
    const loop = createLoop({
      update: vi.fn(),
      render: vi.fn(),
    });

    loop.start();
    loop.stop();

    expect(callbacks.size).toBe(0);
  });
});
