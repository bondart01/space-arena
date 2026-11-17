
import WebSocket from 'ws';
import { performance } from 'node:perf_hooks';

const BASE_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3000/ws';

const BOT_COUNT = Number(process.argv[2] ?? 8);
const DURATION_SECONDS = Number(process.argv[3] ?? 30);

if (
  !Number.isInteger(BOT_COUNT) ||
  BOT_COUNT < 1 ||
  !Number.isFinite(DURATION_SECONDS) ||
  DURATION_SECONDS <= 0
) {
  throw new Error('Usage: node scripts/load-test.js 8 30');
}

const bots = [];
const metrics = {
  connected: 0,
  failed: 0,
  disconnected: 0,
  snapshots: 0,
  inputsSent: 0,
  errors: 0,
};

async function createRoom(index) {
  const response = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `Benchmark ${Date.now()}-${index}`,
      maxPlayers: 2,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.room?.id) {
    throw new Error(
      `Cannot create room: ${JSON.stringify(data)}`,
    );
  }

  return data.room.id;
}

function createBot(index, roomId) {
  return new Promise((resolve) => {
    const socket = new WebSocket(WS_URL);
    const bot = {
      socket,
      index,
      joined: false,
      seq: 0,
      interval: null,
    };

    bots.push(bot);

    let settled = false;

    const timeout = setTimeout(() => {
      if (!bot.joined) {
        socket.terminate();
        finish(false);
      }
    }, 5000);

    function finish(success) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (success) {
        metrics.connected++;
      } else {
        metrics.failed++;
      }

      resolve(bot);
    }

    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'join',
          roomId,
          name: `Bot_${index}`,
        }),
      );
    });

    socket.on('message', (raw) => {
      let message;

      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.type === 'joined') {
        bot.joined = true;
        finish(true);

        bot.interval = setInterval(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            return;
          }

          bot.seq++;

          socket.send(
            JSON.stringify({
              type: 'input',
              seq: bot.seq,
              thrust: true,
              left: bot.seq % 120 < 60,
              right: bot.seq % 120 >= 60,
              shoot: bot.seq % 10 === 0,
            }),
          );

          metrics.inputsSent++;
        }, 50);
      }

      if (message.type === 'snapshot') {
        metrics.snapshots++;
      }
    });

    socket.on('error', () => {
      metrics.errors++;
      finish(false);
    });

    socket.on('close', () => {
      if (bot.interval) {
        clearInterval(bot.interval);
      }

      if (bot.joined) {
        metrics.disconnected++;
      }

      finish(false);
    });
  });
}

async function main() {
  console.log('SPACE ARENA LOAD TEST');
  console.log(`Bots: ${BOT_COUNT}`);
  console.log(`Duration: ${DURATION_SECONDS} seconds`);

  const roomCount = Math.ceil(BOT_COUNT / 2);
  const roomIds = [];

  console.log(`Creating ${roomCount} rooms...`);

  for (let i = 0; i < roomCount; i++) {
    roomIds.push(await createRoom(i));
  }

  console.log('Connecting bots...');

  const setupStart = performance.now();

  // Connect in small batches to avoid artificial
  // connection spikes during setup.
  for (let i = 0; i < BOT_COUNT; i += 8) {
    const batch = [];

    for (let j = i; j < Math.min(i + 8, BOT_COUNT); j++) {
      batch.push(createBot(j + 1, roomIds[Math.floor(j / 2)]));
    }

    await Promise.all(batch);
  }

  const setupTime = performance.now() - setupStart;

  console.log(`Connected: ${metrics.connected}/${BOT_COUNT}`);
  console.log(`Setup time: ${setupTime.toFixed(0)} ms`);
  console.log('Measuring...');

  const start = performance.now();

  await new Promise((resolve) => {
    setTimeout(resolve, DURATION_SECONDS * 1000);
  });

  const elapsed = (performance.now() - start) / 1000;

  for (const bot of bots) {
    if (bot.interval) {
      clearInterval(bot.interval);
    }
  }

  const active = bots.filter(
    (bot) => bot.socket.readyState === WebSocket.OPEN,
  ).length;

  console.log('\n===== RESULTS =====');
  console.log(`Requested bots: ${BOT_COUNT}`);
  console.log(`Connected bots: ${metrics.connected}`);
  console.log(`Active at end: ${active}`);
  console.log(`Failed connections: ${metrics.failed}`);
  console.log(`Unexpected disconnections: ${metrics.disconnected}`);
  console.log(`Errors: ${metrics.errors}`);
  console.log(`Duration: ${elapsed.toFixed(2)} s`);
  console.log(`Inputs sent: ${metrics.inputsSent}`);
  console.log(`Snapshots received: ${metrics.snapshots}`);
  console.log(
    `Snapshots/sec: ${(metrics.snapshots / elapsed).toFixed(2)}`,
  );

  for (const bot of bots) {
    if (bot.socket.readyState === WebSocket.OPEN) {
      bot.socket.close(1000, 'Load test finished');
    } else if (bot.socket.readyState === WebSocket.CONNECTING) {
      bot.socket.terminate();
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 500));
}

main().catch((error) => {
  console.error('Load test failed:', error.message);

  for (const bot of bots) {
    if (bot.interval) clearInterval(bot.interval);
    bot.socket.terminate();
  }

  process.exitCode = 1;
});
