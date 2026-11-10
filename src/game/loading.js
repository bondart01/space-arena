
export function createLoadingScreen(canvas) {
  const ctx = canvas.getContext('2d');

  const width = 960;
  const height = 540;

  function draw({
    percent = 0,
    completed = 0,
    total = 0,
    asset = '',
    error = '',
  } = {}) {
    const progress = Math.max(
      0,
      Math.min(100, percent),
    );

    // Фон
    ctx.fillStyle = '#07111f';
    ctx.fillRect(0, 0, width, height);

    // Заголовок
    ctx.textAlign = 'center';
    ctx.fillStyle = '#42e8ff';
    ctx.font = 'bold 46px Arial';
    ctx.fillText('SPACE ARENA', width / 2, 165);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px Arial';
    ctx.fillText(
      'Loading game resources...',
      width / 2,
      210,
    );

    // Рамка прогрес-бара
    const barWidth = 520;
    const barHeight = 24;
    const barX = (width - barWidth) / 2;
    const barY = 265;

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Заповнення прогрес-бара
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(
      barX,
      barY,
      (barWidth * progress) / 100,
      barHeight,
    );

    ctx.strokeStyle = '#67e8f9';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      barX,
      barY,
      barWidth,
      barHeight,
    );

    // Відсотки
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(
      `${Math.round(progress)}%`,
      width / 2,
      335,
    );

    // Кількість завантажених файлів
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px Arial';
    ctx.fillText(
      `${completed} / ${total} resources`,
      width / 2,
      370,
    );

    if (asset) {
      ctx.fillText(
        `Loaded: ${asset}`,
        width / 2,
        400,
      );
    }

    // Повідомлення про помилку
    if (error) {
      ctx.fillStyle = '#fb7185';
      ctx.font = '18px Arial';
      ctx.fillText(
        'Loading failed. Please retry.',
        width / 2,
        445,
      );
    }
  }

  return { draw };
}
