
import { test, expect } from '@playwright/test';

test('Space Arena: lobby opens and accepts player name', async ({
  page,
}) => {
  // Відкриваємо гру
  await page.goto('http://localhost:5175/');

  // Чекаємо появи кнопки переходу до лобі
  const audioButton = page.getByRole('button', {
    name: 'ENABLE AUDIO & CONTINUE',
  });

  await expect(audioButton).toBeVisible({
    timeout: 15000,
  });

  // Завантажуємо аудіо та відкриваємо лобі
  await audioButton.click();

  // Перевіряємо появу поля імені
  const nameInput = page.locator('#playerName');

  await expect(nameInput).toBeVisible({
    timeout: 15000,
  });

  // Вводимо ім'я гравця
  await nameInput.fill('Player1');

  // Перевіряємо введене значення
  await expect(nameInput).toHaveValue('Player1');

  // Перевіряємо кнопку входу
  await expect(
    page.getByRole('button', { name: 'JOIN GAME' }),
  ).toBeVisible();
});
