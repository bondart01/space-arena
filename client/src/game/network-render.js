
/* global Math */

export function createNetworkRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  const WIDTH = 960;
  const HEIGHT = 540;

  function drawBackground() {
    ctx.fillStyle = '#07111f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.fillStyle = '#64748b';

    for (let x = 40; x < WIDTH; x += 80) {
      for (let y = 40; y < HEIGHT; y += 80) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  function drawShip(ship, isLocal) {
    ctx.save();

    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    ctx.strokeStyle = isLocal ? '#42e8ff' : '#fb7185';
    ctx.fillStyle = isLocal ? '#0891b2' : '#9f1239';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-14, -13);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-14, 13);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    if (isLocal) {
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawBullet(bullet) {
    ctx.fillStyle = '#facc15';

    ctx.beginPath();
    ctx.arc(
      bullet.x,
      bullet.y,
      bullet.radius ?? 4,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  function render(snapshot, localPlayerId) {
    drawBackground();

    if (!snapshot) return;

    for (const ship of Object.values(snapshot.ships ?? {})) {
      drawShip(ship, ship.id === localPlayerId);
    }

    for (const bullet of snapshot.bullets ?? []) {
      drawBullet(bullet);
    }
  }

  return {
    render,
  };
}
