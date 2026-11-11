
import { createRenderer } from './game/render.js';
import { createLoadingScreen } from './game/loading.js';
import { GameAudio } from './audio/audio.js';
import { gameEvents } from './events/game-events.js';

import { Lobby } from './lobby/lobby.js';
import { createLobbyUI } from './lobby/lobby-ui.js';

import { createInput } from './game/input.js';
import { createLoop } from './game/loop.js';

import { GameSocket } from './network/socket.js';
import { createNetworkRenderer } from './game/network-render.js';

import { withRetry } from './async/retry.js';
import { fetchJson, loadAll } from './async/loader.js';



// ========================================
// ЛАБОРАТОРНА №5
// ЕМУЛЯЦІЯ МЕРЕЖЕВОЇ ЗАТРИМКИ
// ========================================

// Штучна затримка отримання snapshot.
// Поки що Client-Side Prediction вимкнений.
const NETWORK_DELAY_MS = 100;

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

gameEvents.on('fired', () => {
  gameAudio.play('shoot');
});

gameEvents.on('hit', () => {
  gameAudio.play('hit');
});

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
  roomsUrl: '/api/rooms',
  refreshInterval: 2000,
  requestTimeout: 3000,
});

const lobbyUI = createLobbyUI(lobby, canvas);

// ========================================
// ЗАПУСК МЕРЕЖЕВОЇ ГРИ
// ========================================

function startGame(room, playerName) {
  activeLoop?.stop();
  activeInput?.destroy();

  lobbyUI.hide();

  canvas.style.display = 'block';
  hpElement.style.display = 'block';
  scoreElement.style.display = 'block';

  const input = createInput();
  const socket = new GameSocket('/ws');
  const networkRenderer = createNetworkRenderer(canvas);

  activeInput = input;

  let playerId = null;
  let snapshot = null;

  let seq = 0;
  let lastAck = 0;

  // ========================================
  // WEBSOCKET
  // ========================================

  socket.on('open', () => {
    console.log('WebSocket connected');
  });

  socket.on('joined', (message) => {
    playerId = message.playerId;

    seq = 0;
    lastAck = 0;
    snapshot = null;

    console.log('Joined room:', room.name);
    console.log('Player ID:', playerId);
    console.log(
      'Simulated snapshot delay:',
      NETWORK_DELAY_MS,
      'ms',
    );
  });

  // ========================================
  // ЗАТРИМКА СЕРВЕРНИХ SNAPSHOT
  // ========================================

  socket.on('snapshot', (message) => {
    setTimeout(() => {
      if (!socket.joined) return;

      snapshot = message.snapshot;
      lastAck = message.ack;
    }, NETWORK_DELAY_MS);
  });

  socket.on('error', (error) => {
    console.error('Network error:', error);
  });

  socket.on('close', () => {
    console.log('WebSocket disconnected');
  });

  socket.join(room.id, playerName);
  socket.connect();

  // ========================================
  // НАДСИЛАННЯ INPUT
  // ========================================

  function update() {
    if (!socket.joined) return;

    const controls = input.getState();

    seq += 1;

    socket.send({
      type: 'input',
      seq,
      thrust: controls.thrust,
      left: controls.left,
      right: controls.right,
      shoot: controls.fire,
    });

    hpElement.textContent =
      `Server tick: ${snapshot?.tick ?? 0} | ` +
      `Delay: ${NETWORK_DELAY_MS} ms`;

    scoreElement.textContent =
      `Input seq: ${seq} | ACK: ${lastAck}`;
  }

  // ========================================
  // ВІДОБРАЖЕННЯ СЕРВЕРНОГО СТАНУ
  // ========================================

  function render() {
    networkRenderer.render(snapshot, playerId);
  }

  // ========================================
  // СТАТИСТИКА
  // ========================================

  function onStats({ fps, sps, frameTime }) {
    fpsElement.textContent = fps.toFixed(1);
    spsElement.textContent = sps.toFixed(1);
    frameTimeElement.textContent = frameTime.toFixed(2);
  }

  activeLoop = createLoop({
    update,
    render,
    onStats,
  });

  activeLoop.start();

  window.addEventListener(
    'pagehide',
    () => socket.disconnect(),
    { once: true },
  );
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
