import { decodeInput } from '@space-arena/shared/binary-protocol';
import { parseClientMessage, type ClientMessage } from '@space-arena/shared/protocol';

/** Single typed boundary for untrusted WebSocket payloads. */
export function decodeClientPayload(raw: unknown, isBinary: boolean): ClientMessage {
  if (isBinary) {
    if (!(raw instanceof Uint8Array)) {
      throw new TypeError('Binary WebSocket payload must be Uint8Array');
    }
    // Copy to a standalone ArrayBuffer so sliced Node buffers decode correctly.
    const bytes = Uint8Array.from(raw);
    return decodeInput(bytes.buffer);
  }

  let value: unknown;
  if (typeof raw === 'string') {
    value = JSON.parse(raw) as unknown;
  } else if (raw instanceof Uint8Array) {
    value = JSON.parse(Buffer.from(raw).toString('utf8')) as unknown;
  } else {
    throw new TypeError('Unsupported WebSocket payload');
  }

  const message = parseClientMessage(value);
  if (!message) throw new Error('Invalid client message schema');
  return message;
}
