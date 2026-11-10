
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
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';

  ctx.scale(dpr, dpr);

  // ========================================
  // ЗОРЯНИЙ ФОН
  // ========================================

  const stars = Array.from({ length: 100 }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.random() * 1.5 + 0.3,
  }));

  function drawBackground() {
    ctx.fillStyle = '#07111f';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';

    for (const star of stars) {
      ctx.beginPath();
      ctx.arc(
        star.x,
        star.y,
        star.radius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  // ========================================
  // КОСМІЧНИЙ КОРАБЕЛЬ
  // ========================================

  function drawShip(ship) {
    ctx.save();

    ctx.translate(ship.position.x, ship.position.y);
    ctx.rotate(ship.angle);

    ctx.strokeStyle = '#42e8ff';
    ctx.fillStyle = '#103b54';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-14, -12);
    ctx.lineTo(-9, 0);
    ctx.lineTo(-14, 12);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ========================================
  // КУЛІ
  // ========================================

  function drawBullet(bullet) {
    ctx.save();

    ctx.fillStyle = '#ffe066';
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.arc(
      bullet.position.x,
      bullet.position.y,
      bullet.radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }

  // ========================================
  // АСТЕРОЇДИ
  // ========================================

  function drawAsteroid(asteroid) {
    ctx.save();

    ctx.translate(
      asteroid.position.x,
      asteroid.position.y,
    );

    ctx.rotate(asteroid.rotation);

    // Якщо є компонент Homing — астероїд червоний
    const isHoming = Boolean(asteroid.homing);

    if (isHoming) {
      ctx.strokeStyle = '#ff7777';
      ctx.fillStyle = '#991b1b';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 22;
    } else {
      ctx.strokeStyle = '#aab8cc';
      ctx.fillStyle = '#334155';
      ctx.shadowBlur = 0;
    }

    ctx.lineWidth = 3;

    ctx.beginPath();

    const points = 9;

    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;

      const radius =
        asteroid.radius *
        (i % 2 === 0 ? 1 : 0.78);

      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Позначка цілі на астероїді із самонаведенням
    if (isHoming) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#fecaca';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.moveTo(-11, 0);
      ctx.lineTo(11, 0);
      ctx.moveTo(0, -11);
      ctx.lineTo(0, 11);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ========================================
  // ЧАСТИНКИ ВИБУХУ
  // ========================================

  function drawParticle(particle) {
    const alpha = Math.max(
      0,
      particle.ttl / particle.maxTtl,
    );

    ctx.save();

    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.shadowColor = particle.color;
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.arc(
      particle.position.x,
      particle.position.y,
      particle.radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }

  // ========================================
  // БОНУС ЗДОРОВ'Я
  // ========================================

  function drawPickup(pickup) {
    const { x, y } = pickup.position;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = '#22c55e';
    ctx.strokeStyle = '#bbf7d0';
    ctx.lineWidth = 2;

    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.arc(
      0,
      0,
      pickup.radius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();

    // Білий хрестик
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.stroke();

    ctx.restore();
  }

  // ========================================
  // ВІДОБРАЖЕННЯ ГРИ
  // ========================================

  function render(world) {
    drawBackground();

    for (const entity of world) {
      switch (entity.kind) {
        case 'ship':
          drawShip(entity);
          break;

        case 'bullet':
          drawBullet(entity);
          break;

        case 'asteroid':
          drawAsteroid(entity);
          break;

        case 'particle':
          drawParticle(entity);
          break;

        case 'pickup':
          drawPickup(entity);
          break;

        default:
          break;
      }
    }
  }

  return {
    render,
    width,
    height,
  };
}
