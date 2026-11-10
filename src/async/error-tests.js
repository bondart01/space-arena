
/* global fetch, AbortController, AbortSignal, console */

import { fetchJson } from './loader.js';
import { withRetry } from './retry.js';

// ========================================
// ТЕСТ 1. HTTP 404
// ========================================

export async function test404() {
  try {
    const response = await fetch(
      '/api/missing-resource.json',
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    // Vite іноді повертає index.html
    // зі статусом 200 для невідомих шляхів.
    const contentType =
      response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      throw new Error(
        'Expected JSON, but server returned HTML',
      );
    }

    console.log('404 test: unexpected success');
  } catch (error) {
    console.log('404 test:', error.message);
  }
}

// ========================================
// ТЕСТ 2. TIMEOUT
// ========================================

export async function testTimeout() {
  try {
    await fetch('/api/rooms.json', {
      signal: AbortSignal.timeout(1),
    });

    console.log('Timeout test: request completed');
  } catch (error) {
    console.log('Timeout test:', error.name);
  }
}

// ========================================
// ТЕСТ 3. ABORT
// ========================================

export async function testAbort() {
  const controller = new AbortController();

  // Примусово скасовуємо запит
  controller.abort();

  try {
    await fetch('/api/rooms.json', {
      signal: controller.signal,
    });

    console.log('Abort test: unexpected success');
  } catch (error) {
    console.log('Abort test:', error.name);
  }
}

// ========================================
// ТЕСТ 4. INVALID JSON
// ========================================

export async function testInvalidJson() {
  try {
    // PNG-файл не містить JSON-даних.
    // Спроба розібрати його як JSON
    // повинна викликати SyntaxError.
    await fetchJson('/assets/ship.png');

    console.log('Invalid JSON test: unexpected success');
  } catch (error) {
    console.log('Invalid JSON test:', error.name);
  }
}

// ========================================
// ТЕСТ 5. RETRY
// ========================================

export async function testRetry() {
  let attempts = 0;

  try {
    const result = await withRetry(
      async () => {
        attempts += 1;

        console.log(`Attempt ${attempts}`);

        // Імітація тимчасової помилки
        if (attempts < 3) {
          throw new Error(
            'Temporary network failure',
          );
        }

        return 'Success';
      },
      {
        retries: 3,
        baseDelay: 100,
        maxDelay: 500,
      },
    );

    console.log('Retry test:', result.toLowerCase());
  } catch (error) {
    console.log('Retry test:', error.message);
  }
}
