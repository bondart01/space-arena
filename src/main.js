
/* global document, window, performance, AbortController, console */

import './style.css';

import { createLoop } from './game/loop.js';
import { gameEvents } from './events/game-events.js';
import { createInput } from './game/input.js';
import { createRenderer } from './game/render.js';
import { createLoadingScreen } from './game/loading.js';

import { fetchJson, loadAll } from './async/loader.js';
import { withRetry } from './async/retry.js';

import { GameAudio } from './audio/audio.js';
import { Lobby } from './lobby/lobby.js';
import { createLobbyUI } from './lobby/lobby-ui.js';

import { Vector2 } from './sim/vector.js';
import { Ship } from './sim/ship.js';
import { Bullet } from './sim/bullet.js';
import { Asteroid } from './sim/asteroid.js';
import { World } from './sim/world.js';
import { Pickup } from './sim/pickup.js';
import { Homing } from './sim/homing.js';

// ========================================
// ОСНОВНІ ЕЛЕМЕНТИ
// ========================================

const canvas = document.querySelector('#gameCanvas');

const fpsElement = document.querySelector('#fps');
const spsElement = document.querySelector('#sps');
const frameTimeElement = document.querySelector('#frameTime');

const renderer = createRenderer(canvas);
const loadingScreen = createLoadingScreen(canvas);

const gameAudio = new GameAudio();

let activeLoop = null;
let activeInput = null;
let loadingController = null;

let manifest = null;
let loadedAssets = new Map();

// ========================================
// СИСТЕМА ІГРОВИХ ПОДІЙ
// ========================================

// Подія пострілу
gameEvents.on('fired', () => {
  gameAudio.play('shoot');
});

// Подія влучання
gameEvents.on('hit', () => {
  gameAudio.play('hit');
});

// Подія вибуху
gameEvents.on('exploded', () => {
  gameAudio.play('explosion');
});

// ========================================
// КНОПКИ
// ========================================

function createButton(text) {
  const button = document.createElement('button');

  button.textContent = text;
  button.style.display = 'none';
  button.style.margin = '16px auto';
  button.style.padding = '12px 24px';
  button.style.background = '#0891b2';
  button.style.color = '#ffffff';
  button.style.border = 'none';
  button.style.borderRadius = '8px';
  button.style.cursor = 'pointer';

  canvas.insertAdjacentElement('afterend', button);

  return button;
}

const retryButton = createButton('Retry loading');
const audioButton = createButton('ENABLE AUDIO & CONTINUE');

// ========================================
// HP ТА SCORE
// ========================================

const hpElement = document.createElement('div');
const scoreElement = document.createElement('div');

for (const element of [hpElement, scoreElement]) {
  element.style.color = '#42e8ff';
  element.style.fontFamily = 'monospace';
  element.style.fontSize = '18px';
  element.style.textAlign = 'center';
  element.style.display = 'none';
}

hpElement.style.marginTop = '8px';
scoreElement.style.marginTop = '4px';

canvas.insertAdjacentElement('afterend', hpElement);
hpElement.insertAdjacentElement('afterend', scoreElement);

// ========================================
// LOBBY
// ========================================

const lobby = new Lobby({
  roomsUrl: '/api/rooms.json',
  refreshInterval: 5000,
  requestTimeout: 3000,
});

const lobbyUI = createLobbyUI(lobby, canvas);

// ========================================
// ЗАПУСК ГРИ
// ========================================

function startGame(room, playerName) {
  activeLoop?.stop();
  activeInput?.destroy();

  lobbyUI.hide();

  canvas.style.display = 'block';
  hpElement.style.display = 'block';
  scoreElement.style.display = 'block';

  console.log('Player:', playerName);
  console.log('Room:', room);

  const input = createInput();
  const world = new World();

  activeInput = input;

  const ship = world.spawn(
    new Ship({
      position: new Vector2(
        renderer.width / 2,
        renderer.height / 2,
      ),
    }),
  );

  // Створення звичайних астероїдів
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

  // Астероїд із самонаведенням
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

  // Бонуси відновлення здоров'я
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

  let previousFire = false;
  let respawnTimer = 0;

  // ========================================
  // ОНОВЛЕННЯ ІГРОВОГО СВІТУ
  // ========================================

  function update(dt) {
    const controls = input.getState();

    world.input = controls;

    // Постріл
    if (
      ship.alive &&
      controls.fire &&
      !previousFire
    ) {
      const bulletData = ship.fire();

      if (bulletData) {
        const bullet = world.spawn(
          new Bullet(bulletData),
        );

        // Генеруємо подію замість
        // прямого виклику аудіосистеми
        gameEvents.emit('fired', {
          shipId: ship.id,
          bulletId: bullet.id,
        });
      }
    }

    previousFire = controls.fire;

    // Оновлення фізики та зіткнень
    world.step(dt);

    // Відродження корабля
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

    // Перехід через межі екрана
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
  // ВІДОБРАЖЕННЯ
  // ========================================

  function render() {
    renderer.render(world);
  }

  function onStats({ fps, sps, frameTime }) {
    fpsElement.textContent = fps.toFixed(1);
    spsElement.textContent = sps.toFixed(1);
    frameTimeElement.textContent =
      frameTime.toFixed(2);
  }

  activeLoop = createLoop({
    update,
    render,
    onStats,
  });

  activeLoop.start();
}

// ========================================
// ПІДКЛЮЧЕННЯ LOBBY
// ========================================

lobby.addEventListener('join', (event) => {
  const { playerName, room } = event.detail;

  startGame(room, playerName);
});

// ========================================
// ЕТАП 1. ЗАВАНТАЖЕННЯ ЗОБРАЖЕНЬ І JSON
// ========================================

async function initialize() {
  loadingController?.abort();

  const controller = new AbortController();
  loadingController = controller;

  retryButton.style.display = 'none';
  audioButton.style.display = 'none';
  hpElement.style.display = 'none';
  scoreElement.style.display = 'none';

  lobbyUI.hide();
  canvas.style.display = 'block';

  loadingScreen.draw({
    percent: 0,
    completed: 0,
    total: 0,
  });

  try {
    const startTime = performance.now();

    manifest = await withRetry(
      () =>
        fetchJson('/manifest.json', {
          signal: controller.signal,
        }),
      {
        signal: controller.signal,
        retries: 3,
      },
    );

    // Завантаження зображень та JSON
    const visualManifest = {
      ...manifest,
      assets: manifest.assets.filter(
        (asset) => asset.type !== 'audio',
      ),
    };

    loadedAssets = await loadAll(visualManifest, {
      signal: controller.signal,
      onProgress: (progress) => {
        loadingScreen.draw(progress);
      },
    });

    controller.signal.throwIfAborted();

    renderer.setAssets(loadedAssets);

    console.log(
      'Visual resources loaded in',
      (performance.now() - startTime).toFixed(2),
      'ms',
    );

    // Очікування дії користувача
    audioButton.style.display = 'block';
  } catch (error) {
    if (controller.signal.aborted) return;

    console.error('Loading failed:', error);

    loadingScreen.draw({
      percent: 0,
      error: error.message,
    });

    retryButton.style.display = 'block';
  }
}

// ========================================
// ЕТАП 2. ЗАВАНТАЖЕННЯ АУДІО
// ========================================

async function enableAudioAndContinue() {
  audioButton.style.display = 'none';
  retryButton.style.display = 'none';

  const controller = new AbortController();
  loadingController = controller;

  try {
    // AudioContext створюється після кліку
    const audioContext = await gameAudio.initialize();

    const audioManifest = {
      ...manifest,
      assets: manifest.assets.filter(
        (asset) => asset.type === 'audio',
      ),
    };

    loadingScreen.draw({
      percent: 0,
      completed: 0,
      total: audioManifest.assets.length,
    });

    const audioAssets = await loadAll(audioManifest, {
      signal: controller.signal,
      audioContext,
      onProgress: (progress) => {
        loadingScreen.draw(progress);
      },
    });

    controller.signal.throwIfAborted();

    gameAudio.setBuffers(audioAssets);

    for (const [id, resource] of audioAssets) {
      loadedAssets.set(id, resource);
    }

    console.log('Audio resources loaded:', audioAssets);
    console.log('Total resources:', loadedAssets.size);

    // Усі ресурси готові — відкриваємо Lobby
    canvas.style.display = 'none';
    lobbyUI.show();
  } catch (error) {
    if (controller.signal.aborted) return;

    console.error('Audio loading failed:', error);

    loadingScreen.draw({
      percent: 0,
      error: error.message,
    });

    retryButton.style.display = 'block';
  }
}

// ========================================
// ОБРОБНИКИ КНОПОК
// ========================================

audioButton.addEventListener(
  'click',
  enableAudioAndContinue,
);

retryButton.addEventListener('click', () => {
  initialize();
});

// ========================================
// ЗАВЕРШЕННЯ РОБОТИ
// ========================================

window.addEventListener('pagehide', () => {
  loadingController?.abort();

  activeLoop?.stop();
  activeInput?.destroy();

  lobby.destroy();
  lobbyUI.destroy();

  gameAudio.destroy();
});

// ========================================
// СТАРТ
// ========================================

initialize();
