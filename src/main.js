
import './style.css';

import { createLoop } from './game/loop.js';
import { createInput } from './game/input.js';
import { createRenderer } from './game/render.js';

import { Vector2 } from './sim/vector.js';
import { Ship } from './sim/ship.js';
import { Bullet } from './sim/bullet.js';
import { Asteroid } from './sim/asteroid.js';
import { World } from './sim/world.js';
import { Pickup } from './sim/pickup.js';
import { Homing } from './sim/homing.js';

// ========================================
// ІНІЦІАЛІЗАЦІЯ
// ========================================

const canvas = document.querySelector('#gameCanvas');

const fpsElement = document.querySelector('#fps');
const spsElement = document.querySelector('#sps');
const frameTimeElement = document.querySelector('#frameTime');

const renderer = createRenderer(canvas);
const input = createInput();
const world = new World();

// ========================================
// КОРАБЕЛЬ
// ========================================

const ship = world.spawn(
  new Ship({
    position: new Vector2(
      renderer.width / 2,
      renderer.height / 2,
    ),
  }),
);

// ========================================
// ЗВИЧАЙНІ АСТЕРОЇДИ
// ========================================

for (let i = 0; i < 7; i++) {
  const angle = Math.random() * Math.PI * 2;

  world.spawn(
    new Asteroid({
      position: new Vector2(
        Math.random() * renderer.width,
        Math.random() * renderer.height,
      ),
      velocity: Vector2.fromAngle(angle).scale(
        20 + Math.random() * 40,
      ),
      radius: 20 + Math.random() * 15,
    }),
  );
}

// ========================================
// АСТЕРОЇД ІЗ САМОНАВЕДЕННЯМ
// ========================================

world.spawn(
  new Asteroid({
    position: new Vector2(100, 100),
    velocity: new Vector2(30, 0),
    radius: 23,
    homing: new Homing({
      targetId: ship.id,
      strength: 45,
      maxSpeed: 90,
    }),
  }),
);

// ========================================
// БОНУСИ ЗДОРОВ'Я
// ========================================

world.spawn(
  new Pickup({
    position: new Vector2(200, 270),
    healAmount: 30,
  }),
);

world.spawn(
  new Pickup({
    position: new Vector2(760, 270),
    healAmount: 30,
  }),
);

// ========================================
// HUD
// ========================================

const hpElement = document.createElement('div');
const scoreElement = document.createElement('div');

hpElement.style.color = '#42e8ff';
scoreElement.style.color = '#42e8ff';

hpElement.style.fontFamily = 'monospace';
scoreElement.style.fontFamily = 'monospace';

hpElement.style.fontSize = '18px';
scoreElement.style.fontSize = '18px';

hpElement.style.marginTop = '8px';
scoreElement.style.marginTop = '4px';

canvas.insertAdjacentElement('afterend', hpElement);
hpElement.insertAdjacentElement('afterend', scoreElement);

// ========================================
// ЗМІННІ ГРИ
// ========================================

let previousFire = false;
let respawnTimer = 0;

// ========================================
// ОНОВЛЕННЯ ГРИ
// ========================================

function update(dt) {
  const controls = input.getState();

  world.input = controls;

  // Стрільба
  if (ship.alive && controls.fire && !previousFire) {
    const bulletData = ship.fire();

    if (bulletData) {
      world.spawn(new Bullet(bulletData));
    }
  }

  previousFire = controls.fire;

  // Оновлення ігрового світу
  world.step(dt);

  // Відродження через 2 секунди
  if (!ship.alive) {
    respawnTimer += dt;

    if (respawnTimer >= 2) {
      ship.respawn(
        new Vector2(
          renderer.width / 2,
          renderer.height / 2,
        ),
      );

      world.spawn(ship);
      respawnTimer = 0;
    }
  } else {
    respawnTimer = 0;
  }

  // Повернення об'єктів через межі екрана
  for (const entity of world) {
    entity.position.x =
      ((entity.position.x % renderer.width) +
        renderer.width) %
      renderer.width;

    entity.position.y =
      ((entity.position.y % renderer.height) +
        renderer.height) %
      renderer.height;
  }

  // Оновлення HUD
  hpElement.textContent = `HP: ${ship.hp}`;
  scoreElement.textContent = `Score: ${ship.score}`;
}

// ========================================
// МАЛЮВАННЯ
// ========================================

function render() {
  renderer.render(world);
}

// ========================================
// FPS ТА ПРОДУКТИВНІСТЬ
// ========================================

function onStats({ fps, sps, frameTime }) {
  fpsElement.textContent = fps.toFixed(1);
  spsElement.textContent = sps.toFixed(1);
  frameTimeElement.textContent = frameTime.toFixed(2);
}

// ========================================
// ЗАПУСК
// ========================================

const loop = createLoop({
  update,
  render,
  onStats,
});

loop.start();

// ========================================
// ЗАВЕРШЕННЯ
// ========================================

window.addEventListener('pagehide', () => {
  loop.stop();
  input.destroy();
});
