/** Network gameplay rendering uses the same server-authoritative snapshot for all clients. */
export interface RenderShip { id: string; x: number; y: number; angle: number; health?: number; score?: number }
export interface RenderBullet { x: number; y: number; radius?: number }
export interface RenderAsteroid { x: number; y: number; radius: number }
export interface RenderPickup { x: number; y: number; radius: number; kind: 'health' | 'score' }
export interface RenderSnapshot {
  ships?: Record<string, RenderShip>;
  bullets?: RenderBullet[];
  asteroids?: RenderAsteroid[];
  pickups?: RenderPickup[];
}


/* global Math */

export function createNetworkRenderer(canvas: HTMLCanvasElement) {
  const ctx: CanvasRenderingContext2D = canvas.getContext('2d')!;
  if (!ctx) throw new Error('Canvas 2D context unavailable');

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

  function drawShip(ship: RenderShip, isLocal: boolean) {
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

  function drawBullet(bullet: RenderBullet) {
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

  function drawAsteroid(asteroid: RenderAsteroid) {
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9;
      const radius = asteroid.radius * (i % 3 === 0 ? 0.78 : 1);
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  function drawPickup(pickup: RenderPickup) {
    ctx.save(); ctx.translate(pickup.x, pickup.y);
    ctx.fillStyle = pickup.kind === 'health' ? '#22c55e' : '#facc15';
    ctx.beginPath(); ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#07111f'; ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pickup.kind === 'health' ? '+' : 'в…', 0, 0);
    ctx.restore();
  }
  function render(snapshot: RenderSnapshot | null | undefined, localPlayerId: string) {
    drawBackground();

    if (!snapshot) return;

    for (const asteroid of snapshot.asteroids ?? []) drawAsteroid(asteroid);
    for (const pickup of snapshot.pickups ?? []) drawPickup(pickup);
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

