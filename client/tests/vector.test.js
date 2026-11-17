import { describe, expect, it } from 'vitest';
import { Vector2 } from '../src/sim/vector.js';

describe('Vector2', () => {
  it('creates zero vector by default', () => {
    expect(new Vector2()).toEqual(new Vector2(0, 0));
  });

  it('stores coordinates', () => {
    expect(new Vector2(3, 4)).toMatchObject({ x: 3, y: 4 });
  });

  it('adds vectors', () => {
    expect(new Vector2(2, 3).add(new Vector2(4, 5)))
      .toEqual(new Vector2(6, 8));
  });

  it('subtracts vectors', () => {
    expect(new Vector2(8, 7).sub(new Vector2(3, 2)))
      .toEqual(new Vector2(5, 5));
  });

  it('scales vector', () => {
    expect(new Vector2(2, 3).scale(4))
      .toEqual(new Vector2(8, 12));
  });

  it('calculates length', () => {
    expect(new Vector2(3, 4).length()).toBe(5);
  });

  it('normalizes vector', () => {
    const result = new Vector2(3, 4).normalize();
    expect(result.length()).toBeCloseTo(1);
  });

  it('normalizes zero vector', () => {
    expect(new Vector2(0, 0).normalize())
      .toEqual(new Vector2(0, 0));
  });

  it('rotates vector by 90 degrees', () => {
    const result = new Vector2(1, 0).rotate(Math.PI / 2);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(1);
  });

  it('calculates dot product', () => {
    expect(new Vector2(2, 3).dot(new Vector2(4, 5))).toBe(23);
  });

  it('creates vector from angle', () => {
    const result = Vector2.fromAngle(0);
    expect(result.x).toBeCloseTo(1);
    expect(result.y).toBeCloseTo(0);
  });

  it('does not mutate original vector when adding', () => {
    const original = new Vector2(1, 2);
    original.add(new Vector2(3, 4));
    expect(original).toEqual(new Vector2(1, 2));
  });
});
