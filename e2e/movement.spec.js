
import { test, expect } from '@playwright/test';

test('Space Arena: movement synchronizes between players', async ({
  browser,
}) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  try {
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();

    const playerIds = [];
    const snapshots = [];

    // Отримуємо ID першого гравця.
    player1.on('websocket', (ws) => {
      ws.on('framereceived', ({ payload }) => {
        if (typeof payload !== 'string') return;

        try {
          const message = JSON.parse(payload);

          if (message.type === 'joined') {
            playerIds.push(message.playerId);
          }
        } catch {
          // Ігноруємо некоректні JSON-повідомлення.
        }
      });
    });

    // Зберігаємо snapshot, які отримує другий гравець.
    player2.on('websocket', (ws) => {
      ws.on('framereceived', ({ payload }) => {
        if (typeof payload !== 'string') return;

        try {
          const message = JSON.parse(payload);

          if (message.type === 'snapshot') {
            snapshots.push(message);

            // Обмежуємо кількість збережених повідомлень.
            if (snapshots.length > 1000) {
              snapshots.shift();
            }
          }
        } catch {
          // Ігноруємо некоректні JSON-повідомлення.
        }
      });
    });

    async function openLobby(page, name) {
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

      await nameInput.fill(name);

      // Чекаємо завантаження кімнат.
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

    // Відкриваємо два незалежні браузери.
    const select1 = await openLobby(player1, 'Player1');
    const select2 = await openLobby(player2, 'Player2');

    const roomId = await select1.inputValue();

    expect(roomId).not.toBe('');

    // Обираємо однакову кімнату.
    await select2.selectOption(roomId);

    // Підключаємо обох гравців.
    await player1.locator('.lobby-join').click();
    await player2.locator('.lobby-join').click();

    // Чекаємо підтвердження підключення.
    await expect
      .poll(() => playerIds.length, {
        timeout: 15000,
      })
      .toBeGreaterThan(0);

    const playerId = playerIds[0];

    // Чекаємо snapshot, який містить корабель Player1.
    await expect
      .poll(
        () =>
          snapshots.some(
            (message) =>
              message.snapshot?.ships?.[playerId],
          ),
        { timeout: 15000 },
      )
      .toBe(true);

    // Перевіряємо, що координати є числами.
    const latestSnapshot = snapshots
      .filter(
        (message) =>
          message.snapshot?.ships?.[playerId],
      )
      .at(-1);

    const initialShip =
      latestSnapshot.snapshot.ships[playerId];

    expect(Number.isFinite(initialShip.x)).toBe(true);
    expect(Number.isFinite(initialShip.y)).toBe(true);

    const initialX = initialShip.x;
    const initialY = initialShip.y;
    const initialTick = latestSnapshot.snapshot.tick;

    // Керуємо кораблем першого гравця.
    await player1.bringToFront();

    await player1.keyboard.down('w');

    // Утримуємо W протягом 1 секунди.
    await player1.waitForTimeout(1000);

    await player1.keyboard.up('w');

    // Другий гравець має отримати нові координати.
    await expect
      .poll(
        () => {
          return snapshots.some((message) => {
            const snapshot = message.snapshot;
            const ship = snapshot?.ships?.[playerId];

            if (!ship) return false;

            // Перевіряємо тільки нові серверні кадри.
            if (snapshot.tick <= initialTick) {
              return false;
            }

            return (
              Math.abs(ship.x - initialX) > 0.01 ||
              Math.abs(ship.y - initialY) > 0.01
            );
          });
        },
        { timeout: 15000 },
      )
      .toBe(true);

    console.log(
      'SUCCESS: Player2 received updated coordinates of Player1',
    );
  } finally {
    await context1.close();
    await context2.close();
  }
});
