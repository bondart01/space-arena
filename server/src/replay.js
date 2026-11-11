
import fs from 'node:fs';
import readline from 'node:readline';
import { config } from './config.js';
import path from 'node:path';

const logPath = path.join(config.logDir, 'matches.ndjson');

export async function replayLogs(filePath = logPath) {
  if (!fs.existsSync(filePath)) {
    console.log('[Replay] Log file not found:', filePath);
    return;
  }

  const stream = fs.createReadStream(filePath, {
    encoding: 'utf8',
    highWaterMark: 64 * 1024,
  });

  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  let totalEvents = 0;
  const eventCounts = {};

  try {
    for await (const line of lines) {
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line);

        totalEvents++;

        const type = event.type ?? 'unknown';
        eventCounts[type] = (eventCounts[type] ?? 0) + 1;

        console.log(
          `[Replay] ${type} | ${event.roomId ?? '-'} | ${event.message ?? ''}`,
        );
      } catch {
        console.warn('[Replay] Invalid JSON line skipped');
      }
    }
  } finally {
    stream.destroy();
  }

  console.log('\n===== REPLAY SUMMARY =====');
  console.log('Total events:', totalEvents);
  console.table(eventCounts);

  return {
    totalEvents,
    eventCounts,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  await replayLogs();
}
