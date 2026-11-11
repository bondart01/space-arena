
/* global document, window, performance, AbortController, setTimeout, clearTimeout, setInterval, clearInterval */

import { createRenderer } from './game/render.js';
import { createLoadingScreen } from './game/loading.js';
import { GameAudio } from './audio/audio.js';
import { gameEvents } from './events/game-events.js';

import { Lobby } from './lobby/lobby.js';
import { createLobbyUI } from './lobby/lobby-ui.js';

import { createInput } from './game/input.js';
import { createLoop } from './game/loop.js';

import { GameSocket } from './network/socket.js';
import { ClientPrediction } from './network/prediction.js';
import { RemoteInterpolation } from './network/interpolation.js';
import { BulletPrediction } from './network/bullet-prediction.js';
import { NetworkStats } from './network/network-stats.js';

import { createNetworkRenderer } from './game/network-render.js';

import { withRetry } from './async/retry.js';
import { fetchJson, loadAll } from './async/loader.js';

const NETWORK_DELAY_MS = 100;
const INTERPOLATION_DELAY_MS = 100;
const PING_INTERVAL_MS = 1000;

const canvas = document.querySelector('#gameCanvas');

const fpsElement = document.querySelector('#fps');
const spsElement = document.querySelector('#sps');
const frameTimeElement = document.querySelector('#frameTime');

const renderer = createRenderer(canvas);
const loadingScreen = createLoadingScreen(canvas);
const gameAudio = new GameAudio();

let activeLoop = null;
let activeInput = null;
let activeSocket = null;
let activeSessionCleanup = null;
let loadingController = null;

let manifest = null;
let loadedAssets = new Map();

// ========================================
// ІГРОВІ ПОДІЇ
// ========================================

gameEvents.on('fired', () => gameAudio.play('shoot'));
gameEvents.on('hit', () => gameAudio.play('hit'));
gameEvents.on('exploded', () => gameAudio.play('explosion'));

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
// ІНФОРМАЦІЙНА ПАНЕЛЬ
// ========================================

function createInfoElement(fontSize = '15px') {
  const element = document.createElement('div');

  element.style.color = '#42e8ff';
  element.style.fontFamily = 'monospace';
  element.style.fontSize = fontSize;
  element.style.textAlign = 'center';
  element.style.marginTop = '5px';
  element.style.display = 'none';

  return element;
}

const hpElement = createInfoElement('18px');
const scoreElement = createInfoElement('18px');
const predictionElement = createInfoElement();
const bulletElement = createInfoElement();

const networkTitle = createInfoElement('18px');
const pingElement = createInfoElement();
const snapshotElement = createInfoElement();
const trafficElement = createInfoElement();

networkTitle.textContent = 'NETWORK STATISTICS';
networkTitle.style.fontWeight = 'bold';
networkTitle.style.marginTop = '14px';

const infoElements = [
  hpElement,
  scoreElement,
  predictionElement,
  bulletElement,
  networkTitle,
  pingElement,
  snapshotElement,
  trafficElement,
];

let previousElement = canvas;

for (const element of infoElements) {
  previousElement.insertAdjacentElement('afterend', element);
  previousElement = element;
}

function showGameInfo(visible) {
  for (const element of infoElements) {
    element.style.display = visible ? 'block' : 'none';
  }
}

function formatMs(value) {
  if (value === null || !Number.isFinite(value)) {
    return '--';
  }

  return value.toFixed(1);
}

function formatBytesPerSecond(value) {
  return `${(value / 1024).toFixed(2)} KB/s`;
}

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
  activeSessionCleanup?.();
  activeSessionCleanup = null;

  activeLoop?.stop();
  activeInput?.destroy();
  activeSocket?.disconnect();

  lobbyUI.hide();
  canvas.style.display = 'block';
  showGameInfo(true);

  const input = createInput();
  const socket = new GameSocket('/ws');

  const networkRenderer = createNetworkRenderer(canvas);

  const prediction = new ClientPrediction();

  const interpolation = new RemoteInterpolation(
    INTERPOLATION_DELAY_MS,
  );

  const bulletPrediction = new BulletPrediction();
  const networkStats = new NetworkStats();

  activeInput = input;
  activeSocket = socket;

  let playerId = null;
  let snapshot = null;

  let seq = 0;
  let lastAck = 0;
  let lastSnapshotTick = -1;

  let pingId = 0;

  const pendingPings = new Map();
  const delayedSnapshots = new Set();

  let lastStatsUpdate = 0;

  // ========================================
  // ОЧИЩЕННЯ МЕРЕЖЕВИХ РЕСУРСІВ
  // ========================================

  function clearDelayedSnapshots() {
    for (const timer of delayedSnapshots) {
      clearTimeout(timer);
    }

    delayedSnapshots.clear();
  }

  function resetNetworkState() {
    playerId = null;
    snapshot = null;

    seq = 0;
    lastAck = 0;
    lastSnapshotTick = -1;

    pendingPings.clear();
    clearDelayedSnapshots();

    prediction.reset();
    interpolation.reset();
    bulletPrediction.reset();
    networkStats.reset();
  }

  // ========================================
  // WEBSOCKET
  // ========================================

  socket.on('open', () => {
    console.log('WebSocket connected');
  });

  socket.on('joined', (message) => {
    resetNetworkState();

    playerId = message.playerId;

    console.log('Joined room:', room.name);
    console.log('Player ID:', playerId);
    console.log(
      'Simulated snapshot delay:',
      NETWORK_DELAY_MS,
      'ms',
    );
  });

  // ========================================
  // PING / PONG
  // ========================================

  socket.on('pong', (message) => {
    const sentAt = pendingPings.get(message.id);

    if (sentAt === undefined) {
      return;
    }

    pendingPings.delete(message.id);

    const rtt = performance.now() - sentAt;

    networkStats.recordRtt(rtt);
  });

  const pingInterval = setInterval(() => {
    if (!socket.joined) {
      return;
    }

    pingId += 1;

    pendingPings.set(pingId, performance.now());

    socket.send({
      type: 'ping',
      id: pingId,
    });

    if (pendingPings.size > 10) {
      const oldestId = pendingPings.keys().next().value;
      pendingPings.delete(oldestId);
    }
  }, PING_INTERVAL_MS);

  // ========================================
  // ОБЛІК ОТРИМАНИХ SNAPSHOT
  // ========================================

  socket.on('snapshot', (message) => {
    const incomingSnapshot = message.snapshot;

    if (!incomingSnapshot) {
      return;
    }

    // Статистику реєструємо при отриманні,
    // до штучної затримки відображення.
    if (
      Number.isSafeInteger(incomingSnapshot.tick) &&
      incomingSnapshot.tick > lastSnapshotTick
    ) {
      networkStats.recordSnapshot(incomingSnapshot.tick);
    }

    const timer = setTimeout(() => {
      delayedSnapshots.delete(timer);

      if (!socket.joined || !playerId) {
        return;
      }

      if (
        !incomingSnapshot ||
        incomingSnapshot.tick <= lastSnapshotTick
      ) {
        return;
      }

      lastSnapshotTick = incomingSnapshot.tick;
      snapshot = incomingSnapshot;

      interpolation.addSnapshot(incomingSnapshot);

      const serverShip =
        incomingSnapshot.ships?.[playerId];

      if (
        Number.isSafeInteger(message.ack) &&
        message.ack >= 0
      ) {
        lastAck = Math.max(lastAck, message.ack);
      }

      if (serverShip) {
        if (!prediction.getShip()) {
          prediction.initialize(serverShip, lastAck);
        } else {
          prediction.reconcile(serverShip, lastAck);
        }
      }

      bulletPrediction.reconcile(
        incomingSnapshot.bullets,
        playerId,
        lastAck,
      );
    }, NETWORK_DELAY_MS);

    delayedSnapshots.add(timer);
  });

  socket.on('error', (error) => {
    console.error('Network error:', error);
  });

  socket.on('close', () => {
    console.log('WebSocket disconnected');

    pendingPings.clear();
    clearDelayedSnapshots();

    prediction.reset();
    interpolation.reset();
    bulletPrediction.reset();
  });

  socket.join(room.id, playerName);
  socket.connect();

  // ========================================
  // ОНОВЛЕННЯ СТАТИСТИКИ
  // ========================================

  function updateNetworkPanel() {
    const stats = networkStats.getStats();
    const traffic = socket.getNetworkStats();

    pingElement.textContent =
      `Ping / RTT: ${formatMs(stats.rtt)} ms | ` +
      `Jitter: ${formatMs(stats.jitter)} ms`;

    snapshotElement.textContent =
      `Snapshot Age: ${formatMs(stats.snapshotAge)} ms | ` +
      `Interval: ${formatMs(stats.snapshotInterval)} ms | ` +
      `Gaps: ${stats.lostSnapshots} | ` +
      `Gap Rate: ${stats.lossPercent.toFixed(1)}%`;

    const elapsedSeconds = Math.max(
      (performance.now() - networkStats.startedAt) / 1000,
      0.001,
    );

    const uploadBps =
      traffic.sentBytes / elapsedSeconds;

    const downloadBps =
      traffic.receivedBytes / elapsedSeconds;

    trafficElement.textContent =
      `Upload: ${formatBytesPerSecond(uploadBps)} | ` +
      `Download: ${formatBytesPerSecond(downloadBps)} | ` +
      `Messages: ${traffic.sentMessages} / ` +
      `${traffic.receivedMessages}`;
  }

  // ========================================
  // INPUT ТА CLIENT PREDICTION
  // ========================================

  function update() {
    if (!socket.joined) {
      return;
    }

    const controls = input.getState();

    seq += 1;

    const currentInput = {
      type: 'input',
      seq,
      thrust: controls.thrust,
      left: controls.left,
      right: controls.right,
      shoot: controls.fire,
    };

    // Надсилаємо команди у форматі Binary (6 байтів).
    socket.sendBinaryInput(currentInput);

    if (prediction.getShip()) {
      prediction.predict(currentInput);
    }

    bulletPrediction.shoot(
      prediction.getShip(),
      currentInput,
    );

    bulletPrediction.update();

    hpElement.textContent =
      `Server tick: ${snapshot?.tick ?? 0} | ` +
      `Delay: ${NETWORK_DELAY_MS} ms`;

    scoreElement.textContent =
      `Input seq: ${seq} | ACK: ${lastAck}`;

    predictionElement.textContent =
      `Prediction: ${
        prediction.getShip() ? 'ON' : 'WAITING'
      } | ` +
      `Pending inputs: ${prediction.getPendingCount()} | ` +
      `Correction: ${prediction.getCorrection().toFixed(2)} px`;

    bulletElement.textContent =
      `Bullet Prediction: ON | ` +
      `Local bullets: ${bulletPrediction.getBullets().length}`;

    const now = performance.now();

    if (now - lastStatsUpdate >= 250) {
      updateNetworkPanel();
      lastStatsUpdate = now;
    }
  }

  // ========================================
  // ВІДОБРАЖЕННЯ ГРИ
  // ========================================

  function render() {
    if (!snapshot) {
      networkRenderer.render(null, playerId);
      return;
    }

    const remoteShips =
      interpolation.getInterpolatedShips(playerId);

    const predictedShip = prediction.getShip();

    const renderShips = {
      ...snapshot.ships,
      ...remoteShips,
    };

    if (predictedShip && playerId) {
      renderShips[playerId] = {
        ...predictedShip,
      };
    }

    const renderBullets = [
      ...(snapshot.bullets ?? []),
      ...bulletPrediction.getBullets(),
    ];

    const renderSnapshot = {
      ...snapshot,
      ships: renderShips,
      bullets: renderBullets,
    };

    networkRenderer.render(
      renderSnapshot,
      playerId,
    );
  }

  // ========================================
  // FPS / SPS
  // ========================================

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

  // ========================================
  // ЗАВЕРШЕННЯ СЕСІЇ
  // ========================================

  let cleanedUp = false;

  activeSessionCleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;

    clearInterval(pingInterval);
    pendingPings.clear();
    clearDelayedSnapshots();
  };
}

// ========================================
// ПІДКЛЮЧЕННЯ LOBBY
// ========================================

lobby.addEventListener('join', (event) => {
  const { playerName, room } = event.detail;

  startGame(room, playerName);
});

// ========================================
// ЗАВАНТАЖЕННЯ РЕСУРСІВ
// ========================================

async function initialize() {
  loadingController?.abort();

  const controller = new AbortController();
  loadingController = controller;

  retryButton.style.display = 'none';
  audioButton.style.display = 'none';

  showGameInfo(false);

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
    if (controller.signal.aborted) {
      return;
    }

    console.error('Loading failed:', error);

    loadingScreen.draw({
      percent: 0,
      error: error.message,
    });

    retryButton.style.display = 'block';
  }
}

// ========================================
// ЗАВАНТАЖЕННЯ АУДІО
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

    console.log(
      'Audio resources loaded:',
      audioAssets,
    );

    console.log(
      'Total resources:',
      loadedAssets.size,
    );

    canvas.style.display = 'none';
    lobbyUI.show();
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }

    console.error('Audio loading failed:', error);

    loadingScreen.draw({
      percent: 0,
      error: error.message,
    });

    retryButton.style.display = 'block';
  }
}

// ========================================
// КНОПКИ
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

  activeSessionCleanup?.();

  activeLoop?.stop();
  activeInput?.destroy();
  activeSocket?.disconnect();

  lobby.destroy();
  lobbyUI.destroy();
  gameAudio.destroy();
});

// ========================================
// СТАРТ
// ========================================

initialize();
