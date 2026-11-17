
import { test, expect } from '@playwright/test';

test('Space Arena: chat message reaches second player', async ({
  browser,
}) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  try {
    const player1 = await context1.newPage();
    const player2 = await context2.newPage();
    await player1.addInitScript(() => {
  const NativeWebSocket = window.WebSocket;

  window.WebSocket = class extends NativeWebSocket {
    constructor(...args) {
      super(...args);
      window.__testChatSocket = this;
    }
  };
});

    const receivedMessages = [];
    let senderSocket;

    // Знаходимо WebSocket першого гравця.
    player1.on('websocket', (ws) => {
      senderSocket = ws;
    });

    // Перехоплюємо повідомлення другого гравця.
    player2.on('websocket', (ws) => {
      ws.on('framereceived', ({ payload }) => {
        if (typeof payload !== 'string') return;

        try {
          const message = JSON.parse(payload);

          if (message.type === 'chat') {
            receivedMessages.push(message);
          }
        } catch {
          // Пропускаємо не-JSON повідомлення.
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

      await expect
        .poll(async () =>
          roomSelect.locator('option').evaluateAll(
            (options) =>
              options
                .map((option) => option.value)
                .filter(Boolean),
          ),
        )
        .not.toEqual([]);

      return roomSelect;
    }

    const select1 = await openLobby(player1, 'Player1');
    const select2 = await openLobby(player2, 'Player2');

    const roomId = await select1.inputValue();

    expect(roomId).not.toBe('');

    await select2.selectOption(roomId);

    await player1.locator('.lobby-join').click();
    await player2.locator('.lobby-join').click();

    await expect(
      player1.getByText(/RIVAL:.*HP/),
    ).toBeVisible({ timeout: 15000 });

    await expect(
      player2.getByText(/RIVAL:.*HP/),
    ).toBeVisible({ timeout: 15000 });

    expect(senderSocket).toBeDefined();

    const chatText = 'Hello from Player1!';

    // Надсилаємо повідомлення через WebSocket першого гравця.
    await player1.evaluate((text) => {
      const socket = window.__testChatSocket;

      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('Chat WebSocket is not available');
      }

      socket.send(
        JSON.stringify({
          type: 'chat',
          text,
        }),
      );
    }, chatText);

    // Перевіряємо доставку другому гравцеві.
    await expect
      .poll(
        () =>
          receivedMessages.some(
            (message) =>
              message.message === chatText &&
              message.playerName === 'Player1' &&
              message.roomId === roomId,
          ),
        { timeout: 15000 },
      )
      .toBe(true);

    console.log(
      'SUCCESS: Player2 received chat message from Player1',
    );
  } finally {
    await context1.close();
    await context2.close();
  }
});
