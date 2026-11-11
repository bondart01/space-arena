
/* global fetch, Image, URL */

import { withRetry } from './retry.js';

// ========================================
// ПЕРЕВІРКА HTTP-ВІДПОВІДІ
// ========================================

async function fetchChecked(url, signal) {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    const error = new Error(
      `HTTP ${response.status}: ${url}`,
    );

    error.status = response.status;
    throw error;
  }

  return response;
}

// ========================================
// ЗАВАНТАЖЕННЯ JSON
// ========================================

export async function fetchJson(url, { signal } = {}) {
  const response = await fetchChecked(url, signal);
  return response.json();
}

export async function loadJson(url, { signal } = {}) {
  return fetchJson(url, { signal });
}

// ========================================
// ЗАВАНТАЖЕННЯ ЗОБРАЖЕННЯ
// ========================================

export async function loadImage(url, { signal } = {}) {
  const response = await fetchChecked(url, signal);
  const blob = await response.blob();

  signal?.throwIfAborted();

  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();

    await new Promise((resolve, reject) => {
      let settled = false;

      function cleanup() {
        signal?.removeEventListener('abort', onAbort);
        image.onload = null;
        image.onerror = null;
      }

      function finish(error) {
        if (settled) return;

        settled = true;
        cleanup();

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }

      function onAbort() {
        image.src = '';
        finish(
          signal.reason ??
            new Error('Image loading aborted'),
        );
      }

      image.onload = () => finish();

      image.onerror = () => {
        finish(new Error(`Invalid image: ${url}`));
      };

      signal?.addEventListener('abort', onAbort, {
        once: true,
      });

      if (signal?.aborted) {
        onAbort();
        return;
      }

      image.src = objectUrl;
    });

    signal?.throwIfAborted();

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// ========================================
// ЗАВАНТАЖЕННЯ АУДІО
// ========================================

export async function loadAudio(
  url,
  { signal, audioContext } = {},
) {
  if (!audioContext) {
    throw new Error('AudioContext is required');
  }

  const response = await fetchChecked(url, signal);
  const buffer = await response.arrayBuffer();

  signal?.throwIfAborted();

  const decoded = await audioContext.decodeAudioData(
    buffer,
  );

  signal?.throwIfAborted();

  return decoded;
}

// ========================================
// ЗАВАНТАЖЕННЯ ОДНОГО РЕСУРСУ
// ========================================

async function loadAsset(asset, options) {
  const { signal, audioContext } = options;

  switch (asset.type) {
    case 'image':
      return loadImage(asset.url, { signal });

    case 'audio':
      return loadAudio(asset.url, {
        signal,
        audioContext,
      });

    case 'json':
      return loadJson(asset.url, { signal });

    default:
      throw new Error(
        `Unknown asset type: ${asset.type}`,
      );
  }
}

// ========================================
// ПАРАЛЕЛЬНЕ ЗАВАНТАЖЕННЯ
// ========================================

export async function loadAll(
  manifest,
  {
    signal,
    audioContext,
    onProgress,
  } = {},
) {
  const assets = manifest.assets ?? [];

  const results = new Map();

  let completed = 0;
  const total = assets.length;

  onProgress?.({
    completed,
    total,
    percent: total === 0 ? 100 : 0,
  });

  const tasks = assets.map(async (asset) => {
    const result = await withRetry(
      () =>
        loadAsset(asset, {
          signal,
          audioContext,
        }),
      {
        signal,
        retries: 3,
        baseDelay: 300,
        maxDelay: 5000,

        onRetry: ({ attempt, delay, error }) => {
          console.warn(
            `Retry ${attempt} for ${asset.id}`,
            `after ${delay.toFixed(0)} ms`,
            error.message,
          );
        },
      },
    );

    results.set(asset.id, result);

    completed += 1;

    onProgress?.({
      completed,
      total,
      percent: Math.round(
        (completed / total) * 100,
      ),
      asset: asset.id,
    });

    return result;
  });

  await Promise.all(tasks);

  return results;
}
