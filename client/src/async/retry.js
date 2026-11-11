
/* global DOMException, setTimeout, clearTimeout */

/**
 * Очікування з підтримкою AbortSignal.
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        signal.reason ??
          new DOMException('Operation aborted', 'AbortError'),
      );
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timer);

      signal?.removeEventListener('abort', onAbort);

      reject(
        signal.reason ??
          new DOMException('Operation aborted', 'AbortError'),
      );
    }

    signal?.addEventListener('abort', onAbort, {
      once: true,
    });
  });
}

/**
 * Перевірка можливості повторного запиту.
 */
function isRetryable(error) {
  // Скасовані операції не повторюємо.
  if (
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError'
  ) {
    return false;
  }

  // HTTP 4xx — помилки клієнта.
  if (
    typeof error?.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
  ) {
    return false;
  }

  return true;
}

/**
 * Повторне виконання асинхронної операції.
 *
 * Використовує:
 * - exponential backoff;
 * - jitter;
 * - AbortSignal;
 * - перевірку HTTP-помилок.
 */
export async function withRetry(
  operation,
  {
    retries = 3,
    baseDelay = 300,
    maxDelay = 5000,
    signal,
    onRetry,
  } = {},
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    signal?.throwIfAborted();

    try {
      return await operation(attempt, signal);
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason ?? error;
      }

      // Не повторюємо 4xx, abort і timeout.
      if (!isRetryable(error) || attempt === retries) {
        throw error;
      }

      // Exponential backoff.
      const exponentialDelay = Math.min(
        maxDelay,
        baseDelay * 2 ** attempt,
      );

      // Full jitter.
      const delay = Math.random() * exponentialDelay;

      // Повідомлення про повторну спробу.
      onRetry?.({
        attempt: attempt + 1,
        delay,
        error,
      });

      // Очікування перед наступною спробою.
      await sleep(delay, signal);
    }
  }
}
