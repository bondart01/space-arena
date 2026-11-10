import './style.css';

import { createLoop } from './game/loop.js';
import { createInput } from './game/input.js';
import { integrate } from './game/physics.js';
import { createRenderer } from './game/render.js';

const canvas = document.querySelector('#gameCanvas');

const fpsElement = document.querySelector('#fps');
const spsElement = document.querySelector('#sps');
const frameTimeElement = document.querySelector('#frameTime');

const renderer = createRenderer(canvas);
const input = createInput();

let ship = {
  x: renderer.width / 2,
  y: renderer.height / 2,
  vx: 0,
  vy: 0,
  angle: -Math.PI / 2,
  worldWidth: renderer.width,
  worldHeight: renderer.height,
};

let previousShip = { ...ship };

// ЕКСПЕРИМЕНТ №1
// true — блокування Event Loop
// false — нормальна робота гри
const BLOCK_EVENT_LOOP = false;

function update(dt) {
  if (BLOCK_EVENT_LOOP) {
    const start = performance.now();

    // Штучне блокування головного потоку на 20 мс
    while (performance.now() - start < 20) {
      // Навмисне навантаження на Event Loop
    }
  }

  previousShip = { ...ship };
  ship = integrate(ship, input.getState(), dt);
}

function render(alpha) {
  const interpolatedShip = {
    ...ship,
    x: previousShip.x + (ship.x - previousShip.x) * alpha,
    y: previousShip.y + (ship.y - previousShip.y) * alpha,
  };

  renderer.render(interpolatedShip);
}

function onStats({ fps, sps, frameTime }) {
  fpsElement.textContent = fps.toFixed(1);
  spsElement.textContent = sps.toFixed(1);
  frameTimeElement.textContent = frameTime.toFixed(2);
}

const loop = createLoop({
  update,
  render,
  onStats,
});

loop.start();

window.addEventListener('pagehide', () => {
  loop.stop();
  input.destroy();
});
