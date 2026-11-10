export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D не підтримується');
  }

  const width = 960;
  const height = 540;

  function resize() {
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();

  const stars = Array.from({ length: 100 }, (_, i) => ({
    x: (i * 137.5) % width,
    y: (i * 83.7) % height,
    size: 0.5 + (i % 3) * 0.5,
  }));

  function render(ship) {
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    // Зоряне тло
    ctx.fillStyle = '#94a3b8';

    for (const star of stars) {
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Космічний корабель
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-15, -13);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-15, 13);
    ctx.closePath();

    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  return { render, width, height };
}
