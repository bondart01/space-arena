import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  encodeInput,
  decodeInput,
  BINARY_INPUT_SIZE,
} from '../src/binary-protocol.ts';

const validInput = fc.record({
  seq: fc.integer({ min: 1, max: 4294967295 }),
  thrust: fc.boolean(),
  left: fc.boolean(),
  right: fc.boolean(),
  shoot: fc.boolean(),
});

describe('Binary input protocol', () => {
  it('encodes input into exactly 6 bytes', () => {
    const buffer = encodeInput({
      seq: 1,
      thrust: true,
      left: false,
      right: false,
      shoot: true,
    });

    expect(buffer.byteLength).toBe(BINARY_INPUT_SIZE);
  });

  it('preserves input after encoding and decoding', () => {
    fc.assert(
      fc.property(validInput, (input) => {
        const decoded = decodeInput(encodeInput(input));

        expect(decoded).toEqual({
          type: 'input',
          ...input,
        });
      }),
      { numRuns: 200 },
    );
  });

  it('always produces a frame of the specified size', () => {
    fc.assert(
      fc.property(validInput, (input) => {
        expect(encodeInput(input).byteLength).toBe(6);
      }),
      { numRuns: 200 },
    );
  });

  it('rejects buffers with an invalid length', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 })
          .filter((size) => size !== 6),
        (size) => {
          expect(() =>
            decodeInput(new ArrayBuffer(size)),
          ).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects unknown message types', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 255 }),
        (type) => {
          const buffer = encodeInput({
            seq: 1,
            thrust: false,
            left: false,
            right: false,
            shoot: false,
          });

          new DataView(buffer).setUint8(0, type);

          expect(() => decodeInput(buffer)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects reserved input flags', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 16, max: 255 }),
        (flags) => {
          const buffer = encodeInput({
            seq: 1,
            thrust: false,
            left: false,
            right: false,
            shoot: false,
          });

          new DataView(buffer).setUint8(5, flags);

          expect(() => decodeInput(buffer)).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects zero sequence number', () => {
    const buffer = encodeInput({
      seq: 1,
      thrust: false,
      left: false,
      right: false,
      shoot: false,
    });

    new DataView(buffer).setUint32(1, 0, true);

    expect(() => decodeInput(buffer)).toThrow();
  });

  it('rejects non-ArrayBuffer input', () => {
    expect(() => decodeInput(null)).toThrow(TypeError);
    expect(() => decodeInput('invalid')).toThrow(TypeError);
  });
});
