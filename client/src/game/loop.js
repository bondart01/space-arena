const STEP = 1 / 60;
const MAX_FRAME_TIME = 0.25;

// Експеримент №3
// true — змінний часовий крок
// false — фіксований часовий крок
const VARIABLE_TIMESTEP = false;

export function createLoop({ update, render, onStats = () => {} }) {
  let running = false;
  let previousTime = 0;
  let accumulator = 0;
  let animationId = null;

  let frames = 0;
  let steps = 0;
  let statsTime = 0;

  function frame(timestamp) {
    if (!running) return;

    const deltaTime = Math.min(Math.max((timestamp - previousTime) / 1000, 0), MAX_FRAME_TIME);

    previousTime = timestamp;

    if (VARIABLE_TIMESTEP) {
      // Один крок фізики з реальною тривалістю кадру
      update(deltaTime);
      steps++;
      render(1);
    } else {
      // Фіксований крок симуляції 60 Гц
      accumulator += deltaTime;

      while (accumulator >= STEP) {
        update(STEP);
        accumulator -= STEP;
        steps++;
      }

      render(accumulator / STEP);
    }

    frames++;
    statsTime += deltaTime;

    if (statsTime >= 1) {
      onStats({
        fps: frames / statsTime,
        sps: steps / statsTime,
        frameTime: (statsTime / frames) * 1000,
      });

      frames = 0;
      steps = 0;
      statsTime = 0;
    }

    animationId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;

    running = true;
    previousTime = performance.now();
    accumulator = 0;
    frames = 0;
    steps = 0;
    statsTime = 0;

    animationId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;

    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  return { start, stop };
}
