import { describe, expect, it } from 'vitest';
import { circlesCollide } from '../src/sim/collision.js';

const circle = (x, y, radius = 10) => ({
  position: { x, y },
  radius,
});

describe('Circle collisions', () => {
  it('detects overlapping circles', () => {
    expect(circlesCollide(circle(0, 0), circle(5, 0))).toBe(true);
  });

  it('detects touching circles', () => {
    expect(circlesCollide(circle(0, 0), circle(20, 0))).toBe(true);
  });

  it('rejects separated circles', () => {
    expect(circlesCollide(circle(0, 0), circle(30, 0))).toBe(false);
  });

  it('detects identical positions', () => {
    expect(circlesCollide(circle(5, 5), circle(5, 5))).toBe(true);
  });

  it('is symmetric', () => {
    const a = circle(10, 20);
    const b = circle(15, 25);
    expect(circlesCollide(a, b)).toBe(circlesCollide(b, a));
  });

  it('handles different radii', () => {
    expect(circlesCollide(circle(0, 0, 5), circle(15, 0, 10))).toBe(true);
  });

  it('handles zero radius', () => {
    expect(circlesCollide(circle(0, 0, 0), circle(0, 0, 0))).toBe(true);
  });

  it('handles negative coordinates', () => {
    expect(circlesCollide(circle(-10, -10), circle(-15, -10))).toBe(true);
  });

  it('rejects distant diagonal circles', () => {
    expect(circlesCollide(circle(0, 0), circle(100, 100))).toBe(false);
  });

  it('detects diagonal overlap', () => {
    expect(circlesCollide(circle(0, 0), circle(6, 8))).toBe(true);
  });
});
