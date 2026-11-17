
import { test, expect } from '@playwright/test';

test('Space Arena: two players connect and see each other', async ({
  browser,
}) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  try {
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();

    // Зберігаємо повідомлення про підключення.
    const connections1 = [];
    const connections2 = [];

    player1.on('console', (message) => {
      if (message.text().startsWith('Player ID:')) {
        connections1.push(message.text());
      }
    });

    player2.on('console', (message) => {
      if (message.text().startsWith('Player ID:')) {
        connections2.push(message.text());
      }
    });

    async function openLobby(page, playerName) {
      await page.goto('http://localhost:5175/');

      await page
        .getByRole('button', {
          name: 'ENABLE AUDIO & CONTINUE',
        })
        .click({ timeout: 15000 });

      const nameInput = page.locator('#playerName');
      const roomSelect = page.locator('#roomSelect');

      await expect(nameInput).toBeVisible({
        timeout: 15000,
      });

      await nameInput.fill(playerName);

      await expect
        .poll(async () => {
          return roomSelect.locator('option').evaluateAll(
            (options) =>
              options
                .map((option) => option.value)
                .filter(Boolean),
          );
        })
        .not.toEqual([]);

      return roomSelect;
    }

    // Перший гравець.
    const roomSelect1 = await openLobby(
      player1,
      'Player1',
    );

    // Другий гравець.
    const roomSelect2 = await openLobby(
      player2,
      'Player2',
    );

    // Вибираємо однакову кімнату.
    const roomId = await roomSelect1.inputValue();

    expect(roomId).not.toBe('');

    await roomSelect2.selectOption(roomId);

    // Приєднуємо гравців.
    await player1.locator('.lobby-join').click();
    await player2.locator('.lobby-join').click();

    // Сервер має підтвердити обидва підключення.
    await expect
      .poll(() => connections1.length, {
        timeout: 15000,
      })
      .toBe(1);

    await expect
      .poll(() => connections2.length, {
        timeout: 15000,
      })
      .toBe(1);

    // Кожен гравець має отримати власний ID.
    expect(connections1[0]).not.toBe(connections2[0]);

    // Обидва клієнти мають бачити суперника
    // у стані гри, отриманому від сервера.
    await expect(
      player1.getByText(/RIVAL:.*HP/),
    ).toBeVisible({ timeout: 15000 });

    await expect(
      player2.getByText(/RIVAL:.*HP/),
    ).toBeVisible({ timeout: 15000 });

    // Ігрові полотна залишаються видимими.
    await expect(
      player1.locator('#gameCanvas'),
    ).toBeVisible();

    await expect(
      player2.locator('#gameCanvas'),
    ).toBeVisible();
  } finally {
    await context1.close();
    await context2.close();
  }
});
