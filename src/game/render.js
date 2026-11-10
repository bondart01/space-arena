
/* global window, Math */

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  const width = 960;
  const height = 540;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = '100%';
  canvas.style.maxWidth = `${width}px`;
  canvas.style.aspectRatio = `${width} / ${height}`;

  ctx.scale(dpr, dpr);

  let assets = new Map();

  const stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: Math.random() * 1.5 + 0.3,
  }));

  function setAssets(loadedAssets) {
    assets = loadedAssets;
  }

  function drawBackground() {
    ctx.fillStyle = '#07111f';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#dbeafe';

    for (const star of stars) {
      ctx.beginPath();
      ctx.arc(
        star.x,
        star.y,
        star.size,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  function drawSprite(
    image,
    frameWidth,
    frameHeight,
    frame,
    x,
    y,
    drawWidth,
    drawHeight,
    rotation = 0,
  ) {
    if (!image) return false;

    const frameCount = Math.floor(
      image.width / frameWidth,
    );

    if (frameCount < 1) return false;

    const currentFrame =
      Math.floor(frame) % frameCount;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.drawImage(
      image,
      currentFrame * frameWidth,
      0,
      frameWidth,
      frameHeight,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight,
    );

    ctx.restore();

    return true;
  }

  function drawShip(ship, time) {
    const image = assets.get('ship');

    const frame = Math.floor(time * 10) % 4;

    if (
      drawSprite(
        image,
        64,
        64,
        frame,
        ship.position.x,
        ship.position.y,
        48,
        48,
        ship.angle,
      )
    ) {
      return;
    }

    // Резервне малювання без спрайтшита
    ctx.save();
    ctx.translate(ship.position.x, ship.position.y);
    ctx.rotate(ship.angle);

    ctx.strokeStyle = '#42e8ff';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-12, -12);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, 12);
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
  }

  function drawBullet(bullet, time) {
    const image = assets.get('bullet');

    const frame = Math.floor(time * 16) % 4;

    const rotation = Math.atan2(
      bullet.velocity.y,
      bullet.velocity.x,
    );

    if (
      drawSprite(
        image,
        32,
        32,
        frame,
        bullet.position.x,
        bullet.position.y,
        22,
        22,
        rotation,
      )
    ) {
      return;
    }

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(
      bullet.position.x,
      bullet.position.y,
      bullet.radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  function drawAsteroid(asteroid, time) {
    const image = assets.get('asteroid');

    const frame = Math.floor(time * 4) % 4;

    const isHoming = Boolean(asteroid.homing);

    ctx.save();

    if (isHoming) {
      ctx.shadowColor = '#ff3344';
      ctx.shadowBlur = 24;
    }

    const drawn = drawSprite(
      image,
      64,
      64,
      frame,
      asteroid.position.x,
      asteroid.position.y,
      asteroid.radius * 2.3,
      asteroid.radius * 2.3,
      asteroid.rotation || 0,
    );

    if (!drawn) {
      ctx.translate(
        asteroid.position.x,
        asteroid.position.y,
      );

      ctx.rotate(asteroid.rotation || 0);

      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;

      ctx.beginPath();

      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2;

        const x = Math.cos(angle) * asteroid.radius;
        const y = Math.sin(angle) * asteroid.radius;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();

    if (isHoming) {
      ctx.save();

      ctx.strokeStyle = '#ff4455';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ff3344';
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.arc(
        asteroid.position.x,
        asteroid.position.y,
        asteroid.radius + 8,
        0,
        Math.PI * 2,
      );
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawPickup(pickup) {
    const x = pickup.position.x;
    const y = pickup.position.y;

    ctx.save();

    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 18;

    ctx.fillStyle = '#22c55e';

    ctx.beginPath();
    ctx.arc(x, y, pickup.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x, y + 6);
    ctx.stroke();

    ctx.restore();
  }

  function drawParticle(particle) {
    const ratio = Math.max(
      0,
      particle.ttl / (particle.maxTtl || 1),
    );

    ctx.save();

    ctx.globalAlpha = ratio;

    ctx.fillStyle = particle.color || '#fb923c';

    ctx.beginPath();
    ctx.arc(
      particle.position.x,
      particle.position.y,
      particle.radius || 3,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }

  function render(world) {
    const time = performance.now() / 1000;

    drawBackground();

    for (const entity of world) {
      if (!entity.alive) continue;

      switch (entity.kind) {
        case 'ship':
          drawShip(entity, time);
          break;

        case 'bullet':
          drawBullet(entity, time);
          break;

        case 'asteroid':
          drawAsteroid(entity, time);
          break;

        case 'pickup':
          drawPickup(entity);
          break;

        case 'particle':
          drawParticle(entity);
          break;

        default:
          break;
      }
    }
  }

  return {
    width,
    height,
    render,
    setAssets,
  };
}
