
const MESSAGE_TYPE = {
  INPUT: 1,
};

const INPUT_SIZE = 6;

// Кодування команд гравця у 6 байтів.
export function encodeInput(input) {
  const buffer = new ArrayBuffer(INPUT_SIZE);
  const view = new DataView(buffer);

  view.setUint8(0, MESSAGE_TYPE.INPUT);
  view.setUint32(1, input.seq, true);

  let flags = 0;

  if (input.thrust) flags |= 1;
  if (input.left) flags |= 2;
  if (input.right) flags |= 4;
  if (input.shoot) flags |= 8;

  view.setUint8(5, flags);

  return buffer;
}

// Декодування бінарних команд.
export function decodeInput(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('Expected ArrayBuffer');
  }

  if (buffer.byteLength !== INPUT_SIZE) {
    throw new Error('Invalid binary input size');
  }

  const view = new DataView(buffer);

  const type = view.getUint8(0);

  if (type !== MESSAGE_TYPE.INPUT) {
    throw new Error('Unknown binary message type');
  }

  const seq = view.getUint32(1, true);
  const flags = view.getUint8(5);

  return {
    type: 'input',
    seq,
    thrust: Boolean(flags & 1),
    left: Boolean(flags & 2),
    right: Boolean(flags & 4),
    shoot: Boolean(flags & 8),
  };
}

export const BINARY_MESSAGE_TYPES = MESSAGE_TYPE;
export const BINARY_INPUT_SIZE = INPUT_SIZE;
