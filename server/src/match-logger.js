
import fs from 'node:fs';
import path from 'node:path';
import { Transform, PassThrough, pipeline } from 'node:stream';
import { promisify } from 'node:util';

const pipelineAsync = promisify(pipeline);

export class MatchLogger {
  constructor(logDir) {
    fs.mkdirSync(logDir, { recursive: true });

    this.logPath = path.join(logDir, 'matches.ndjson');

    this.input = new PassThrough({
      objectMode: true,
      highWaterMark: 64,
    });

    this.transform = new Transform({
      writableObjectMode: true,

      transform(event, encoding, callback) {
        try {
          const line = JSON.stringify({
            ...event,
            timestamp: Date.now(),
          });

          callback(null, line + '\n');
        } catch (error) {
          callback(error);
        }
      },
    });

    this.output = fs.createWriteStream(this.logPath, {
      flags: 'a',
    });

    this.pipelinePromise = pipelineAsync(
      this.input,
      this.transform,
      this.output,
    );

    this.pipelinePromise.catch((error) => {
      console.error('[MatchLogger] Pipeline error:', error);
    });
  }

  log(event) {
    if (this.input.destroyed || this.input.writableEnded) {
      return false;
    }

    return this.input.write(event);
  }

  async close() {
    if (!this.input.writableEnded) {
      this.input.end();
    }

    await this.pipelinePromise;
  }
}
