
/* global window */

export class GameAudio {
  constructor() {
    this.context = null;
    this.buffers = new Map();
    this.masterVolume = 0.35;
  }

  // ========================================
  // ІНІЦІАЛІЗАЦІЯ ПІСЛЯ ДІЇ ГРАВЦЯ
  // ========================================

  async initialize() {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error(
          'Web Audio API is not supported',
        );
      }

      this.context = new AudioContextClass();
    }

    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    return this.context;
  }

  // ========================================
  // ОТРИМАННЯ AUDIOCONTEXT
  // ========================================

  getContext() {
    return this.context;
  }

  // ========================================
  // ЗБЕРЕЖЕННЯ ЗАВАНТАЖЕНИХ БУФЕРІВ
  // ========================================

  setBuffers(assets) {
    for (const [id, resource] of assets) {
      if (
        id === 'shoot' ||
        id === 'hit' ||
        id === 'explosion'
      ) {
        this.buffers.set(id, resource);
      }
    }
  }

  // ========================================
  // ВІДТВОРЕННЯ ЗВУКУ
  // ========================================

  play(name, volume = 1) {
    if (!this.context) return false;

    if (this.context.state !== 'running') {
      return false;
    }

    const buffer = this.buffers.get(name);

    if (!buffer) return false;

    const source = this.context.createBufferSource();

    source.buffer = buffer;

    const gainNode = this.context.createGain();

    gainNode.gain.value =
      Math.max(
        0,
        Math.min(1, volume),
      ) * this.masterVolume;

    source.connect(gainNode);
    gainNode.connect(this.context.destination);

    source.start(0);

    return true;
  }

  // ========================================
  // РЕГУЛЮВАННЯ ГУЧНОСТІ
  // ========================================

  setVolume(volume) {
    this.masterVolume = Math.max(
      0,
      Math.min(1, volume),
    );
  }

  // ========================================
  // ОЧИЩЕННЯ РЕСУРСІВ
  // ========================================

  async destroy() {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    this.buffers.clear();
  }
}
