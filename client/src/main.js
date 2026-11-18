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
import { RemoteInterpolation } from './network/interpolation.ts';
import { BulletPrediction } from './network/bullet-prediction.js';
import { NetworkStats } from './network/network-stats.ts';

import { createNetworkRenderer } from './game/network-render.ts';

import { withRetry } from './async/retry.js';
import { fetchJson, loadAll } from './async/loader.js';

const NETWORK_DELAY_MS = 100;
const INTERPOLATION_DELAY_MS = 100;
const PING_INTERVAL_MS = 1000;

const canvas = document.querySelector('#gameCanvas');

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

gameEvents.on('fired', () => {
  console.debug('[audio] fired:', gameAudio.play('shoot'));
});
gameEvents.on('hit', () => {
  console.debug('[audio] hit:', gameAudio.play('hit'));
});
gameEvents.on('exploded', () => {
  console.debug('[audio] exploded:', gameAudio.play('explosion'));
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

// Повідомлення про втрату з'єднання з сервером.
const connectionMessage = document.createElement('div');
connectionMessage.style.color = '#ffcc66';
connectionMessage.style.textAlign = 'center';
connectionMessage.style.fontFamily = 'monospace';
connectionMessage.style.fontSize = '16px';
connectionMessage.style.padding = '12px';
connectionMessage.style.display = 'none';
connectionMessage.setAttribute('role', 'status');
connectionMessage.setAttribute('aria-live', 'polite');
canvas.insertAdjacentElement('afterend', connectionMessage);

function showConnectionMessage(message) {
  connectionMessage.textContent = message;
  connectionMessage.style.display = 'block';
}

function hideConnectionMessage() {
  connectionMessage.textContent = '';
  connectionMessage.style.display = 'none';
}


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

const scoreElement = createInfoElement('18px');
const infoElements = [scoreElement];

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

  hideConnectionMessage();

  lobbyUI.hide();
  canvas.style.display = 'block';
  showGameInfo(true);

  // Entering the game is a user interaction; resume audio if the browser suspended it.
  gameAudio.initialize().catch((error) => {
    console.warn('[audio] Unable to resume:', error);
  });

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
  let previousAudioSnapshot = null;

  let seq = 0;
  let lastAck = 0;
  let lastSnapshotTick = -1;

  let pingId = 0;

  const pendingPings = new Map();
  const delayedSnapshots = new Set();

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
    previousAudioSnapshot = null;

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

      // Sound events are derived from accepted authoritative snapshots, not
      // from every render frame. This prevents audio playing 60 times/second.
      if (previousAudioSnapshot) {
        const previousBullets = new Set(
          (previousAudioSnapshot.bullets ?? [])
            .filter((bullet) => bullet && bullet.id != null)
            .map((bullet) => String(bullet.id)),
        );
        const newBullets = (incomingSnapshot.bullets ?? []).filter(
          (bullet) => bullet && bullet.id != null &&
            !previousBullets.has(String(bullet.id)),
        );
        // A single effect per accepted snapshot even if several shots occurred.
        if (newBullets.length > 0) gameEvents.emit('fired');

        const previousShips = previousAudioSnapshot.ships ?? {};
        const currentShips = incomingSnapshot.ships ?? {};
        let damageOccurred = false;
        let shipDestroyed = false;
        for (const [id, ship] of Object.entries(currentShips)) {
          const previous = previousShips[id];
          if (!previous || !ship) continue;
          if (Number.isFinite(previous.health) && Number.isFinite(ship.health) &&
              ship.health < previous.health) {
            damageOccurred = true;
            if (ship.health <= 0 && previous.health > 0) shipDestroyed = true;
          }
        }
        if (damageOccurred) gameEvents.emit('hit');
        if (shipDestroyed) gameEvents.emit('exploded');

        // Asteroid disappearance is a useful explosion cue when IDs are present.
        const oldAsteroids = previousAudioSnapshot.asteroids ?? [];
        const newAsteroids = incomingSnapshot.asteroids ?? [];
        if (oldAsteroids.length > 0 &&
            oldAsteroids.every((asteroid) => asteroid?.id != null) &&
            newAsteroids.every((asteroid) => asteroid?.id != null)) {
          const newIds = new Set(newAsteroids.map((asteroid) => String(asteroid.id)));
          if (oldAsteroids.some((asteroid) => !newIds.has(String(asteroid.id)))) {
            gameEvents.emit('exploded');
          }
        }
      }
      previousAudioSnapshot = incomingSnapshot;

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

  // При відключенні завершуємо сесію та повертаємося до лобі.
  let sessionEnded = false;

  function returnToLobby(reason) {
    if (sessionEnded || activeSocket !== socket) {
      return;
    }

    sessionEnded = true;
    console.warn('[Network]', reason);

    activeSessionCleanup?.();
    activeSessionCleanup = null;

    activeLoop?.stop();
    activeInput?.destroy();

    clearInterval(pingInterval);
    pendingPings.clear();
    clearDelayedSnapshots();
    resetNetworkState();

    socket.disconnect();

    activeLoop = null;
    activeInput = null;
    activeSocket = null;

    showGameInfo(false);
    canvas.style.display = 'none';
    showConnectionMessage(reason);
    lobbyUI.show();
  }

  socket.on('shutdown', () => {
    returnToLobby(
      'Сервер завершує роботу. Спробуйте підключитися пізніше.',
    );
  });

  socket.on('error', (error) => {
    console.error('Network error:', error);
  });

  socket.on('close', (event) => {
    console.log('WebSocket disconnected:', event.code, event.reason);
    returnToLobby(
      'З’єднання із сервером втрачено. Спробуйте підключитися повторно.',
    );
  });

  socket.join(room.id, playerName);
  socket.connect();

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

    const scoreboard = Object.values(snapshot?.ships ?? {})
      .map((ship) => `${ship.id === playerId ? 'YOU' : 'RIVAL'}: ${ship.score} pts | ${ship.health} HP`)
      .join('  |  ');
    scoreElement.textContent =
      scoreboard || 'Waiting for players';
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

  activeLoop = createLoop({
    update,
    render,
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
