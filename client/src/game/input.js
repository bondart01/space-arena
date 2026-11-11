export function createInput(target = window) {
  const pressedKeys = new Set();

  const controls = {
    ArrowUp: 'thrust',
    KeyW: 'thrust',
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Space: 'fire',
  };

  function onKeyDown(event) {
    if (controls[event.code]) {
      event.preventDefault();
      pressedKeys.add(event.code);
    }
  }

  function onKeyUp(event) {
    pressedKeys.delete(event.code);
  }

  function onBlur() {
    pressedKeys.clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  function isPressed(action) {
    return Object.entries(controls).some(
      ([code, mappedAction]) => mappedAction === action && pressedKeys.has(code),
    );
  }

  function getState() {
    return {
      thrust: isPressed('thrust'),
      left: isPressed('left'),
      right: isPressed('right'),
      fire: isPressed('fire'),
    };
  }

  function destroy() {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
    pressedKeys.clear();
  }

  return { getState, destroy };
}
