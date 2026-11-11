const ACCELERATION = 240;
const ROTATION_SPEED = 3.5;
const DRAG = 0.4;
const MAX_SPEED = 350;

export function integrate(ship, input, dt) {
  const next = { ...ship };

  if (input.left) {
    next.angle -= ROTATION_SPEED * dt;
  }

  if (input.right) {
    next.angle += ROTATION_SPEED * dt;
  }

  if (input.thrust) {
    next.vx += Math.cos(next.angle) * ACCELERATION * dt;
    next.vy += Math.sin(next.angle) * ACCELERATION * dt;
  }

  const damping = Math.exp(-DRAG * dt);

  next.vx *= damping;
  next.vy *= damping;

  const speed = Math.hypot(next.vx, next.vy);

  if (speed > MAX_SPEED) {
    const scale = MAX_SPEED / speed;
    next.vx *= scale;
    next.vy *= scale;
  }

  next.x += next.vx * dt;
  next.y += next.vy * dt;

  const width = next.worldWidth;
  const height = next.worldHeight;

  next.x = ((next.x % width) + width) % width;
  next.y = ((next.y % height) + height) % height;

  return next;
}
