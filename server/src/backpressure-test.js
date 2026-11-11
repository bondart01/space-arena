
import { Writable } from 'node:stream';
import { once } from 'node:events';

const TOTAL_CHUNKS = 100;
const CHUNK_SIZE = 1024;

let processed = 0;
let backpressureCount = 0;

const slowWritable = new Writable({
  highWaterMark: 4 * 1024,

  write(chunk, encoding, callback) {
    setTimeout(() => {
      processed++;
      callback();
    }, 10);
  },
});

async function runTest() {
  console.log('=== BACKPRESSURE TEST ===');

  for (let i = 0; i < TOTAL_CHUNKS; i++) {
    const chunk = Buffer.alloc(CHUNK_SIZE, 'A');

    const canContinue = slowWritable.write(chunk);

    if (!canContinue) {
      backpressureCount++;

      await once(slowWritable, 'drain');
    }
  }

  slowWritable.end();

  await once(slowWritable, 'finish');

  console.log('Chunks written:', TOTAL_CHUNKS);
  console.log('Chunks processed:', processed);
  console.log('Backpressure events:', backpressureCount);
  console.log('Test completed successfully');
}

runTest().catch(console.error);
