
export class GameEvents extends EventTarget {
  emit(type, detail = {}) {
    this.dispatchEvent(
      new CustomEvent(type, { detail }),
    );
  }

  on(type, handler) {
    this.addEventListener(type, handler);

    return () => {
      this.removeEventListener(type, handler);
    };
  }
}

export const gameEvents = new GameEvents();
