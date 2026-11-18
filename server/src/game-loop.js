
import {
  TICK_RATE,
  FIXED_DT,
  stepWorld,
} from '@space-arena/shared';

const TICK_MS = 1000 / TICK_RATE;

export class GameLoop {
  constructor(world, getInputs, onTick = () => {}) {
    this.world = world;
    this.getInputs = getInputs;
    this.onTick = onTick;

    this.running = false;
    this.timer = null;
    this.nextTickTime = 0;

    // Метрики продуктивності.
    this.lastTickDurationMs = 0;
    this.averageTickDurationMs = 0;
    this.maxTickDurationMs = 0;
    this.totalTicks = 0;
    this.totalTickDurationMs = 0;
  }

  start() {
    if (this.running) {
      return;
    }

    this.running = true;
    this.nextTickTime = performance.now() + TICK_MS;

    this.scheduleNextTick();
  }

  scheduleNextTick() {
    if (!this.running) {
      return;
    }

    const delay = Math.max(
      0,
      this.nextTickTime - performance.now(),
    );

    this.timer = setTimeout(() => {
      if (!this.running) {
        return;
      }

      const tickStart = performance.now();

      try {
        const inputs = this.getInputs();

        stepWorld(this.world, inputs, FIXED_DT);
        this.onTick(this.world);
      } finally {
        // Вимірюємо час виконання ігрового такту.
        const duration = performance.now() - tickStart;

        this.lastTickDurationMs = duration;
        this.totalTicks += 1;
        this.totalTickDurationMs += duration;

        this.averageTickDurationMs =
          this.totalTickDurationMs / this.totalTicks;

        this.maxTickDurationMs = Math.max(
          this.maxTickDurationMs,
          duration,
        );
      }

      this.nextTickTime += TICK_MS;

      // Якщо сервер сильно відстав, не накопичуємо
      // нескінченну чергу пропущених кроків.
      if (performance.now() - this.nextTickTime > 1000) {
        this.nextTickTime = performance.now() + TICK_MS;
      }

      this.scheduleNextTick();
    }, delay);
  }

  getMetrics() {
    return {
      running: this.running,
      totalTicks: this.totalTicks,
      lastTickDurationMs: Number(
        this.lastTickDurationMs.toFixed(3),
      ),
      averageTickDurationMs: Number(
        this.averageTickDurationMs.toFixed(3),
      ),
      maxTickDurationMs: Number(
        this.maxTickDurationMs.toFixed(3),
      ),
    };
  }

  stop() {
    this.running = false;

    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
