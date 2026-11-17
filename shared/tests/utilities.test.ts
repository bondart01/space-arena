import { describe, expect, it } from 'vitest';
import {
  asPlayerId,
  asInputSeq,
  asTick,
  describeEntity,
  assertNever,
  createShip,
  createWorld,
  createBullet,
} from '../src/index.ts';

describe('Shared utility functions', () => {
  it('converts player identifier', () => {
    expect(asPlayerId('player1')).toBe('player1');
  });

  it('accepts valid input sequence', () => {
    expect(asInputSeq(42)).toBe(42);
  });

  it('rejects negative input sequence', () => {
    expect(() => asInputSeq(-1)).toThrow(RangeError);
  });

  it('rejects fractional input sequence', () => {
    expect(() => asInputSeq(1.5)).toThrow(RangeError);
  });

  it('accepts valid tick', () => {
    expect(asTick(100)).toBe(100);
  });

  it('rejects negative tick', () => {
    expect(() => asTick(-1)).toThrow(RangeError);
  });

  it('rejects invalid tick', () => {
    expect(() => asTick(NaN)).toThrow(RangeError);
  });

  it('describes ship', () => {
    const ship = createShip('p1', 100, 100);
    expect(describeEntity({ ...ship, kind: 'ship' }))
      .toBe('Ship p1');
  });

  it('describes bullet', () => {
    const world = createWorld();
    const ship = createShip('p1', 100, 100);
    const bullet = createBullet(world, ship);

    expect(describeEntity({ ...bullet, kind: 'bullet' }))
      .toBe('Bullet 1');
  });

  it('throws for unexpected entity variant', () => {
    expect(() => assertNever('unknown' as never))
      .toThrow('Unhandled variant: unknown');
  });

  it('rejects unexpected entity kind', () => {
    expect(() => describeEntity({
      kind: 'unknown',
      id: 1,
    } as never)).toThrow('Unhandled variant');
  });
});
