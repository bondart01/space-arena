// Network snapshots are validated at the protocol boundary. This module
// only needs the ship fields used by the interpolation algorithm.
export interface RemoteShip {
  x: number;
  y: number;
  angle: number;
  [key: string]: unknown;
}

export interface RemoteSnapshot {
  tick: number;
  ships?: Record<string, RemoteShip>;
}

interface TimedSnapshot {
  snapshot: RemoteSnapshot;
  receivedAt: number;
}


import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '@space-arena/shared';

const INTERPOLATION_DELAY_MS = 100;
const MAX_SNAPSHOTS = 20;

function interpolateWrapped(a: number, b: number, t: number, size: number): number {
  let difference = b - a;

  if (difference > size / 2) {
    difference -= size;
  } else if (difference < -size / 2) {
    difference += size;
  }

  return ((a + difference * t) % size + size) % size;
}

function interpolateAngle(a: number, b: number, t: number): number {
  let difference = b - a;

  difference =
    ((difference + Math.PI) % (Math.PI * 2) +
      Math.PI * 2) %
      (Math.PI * 2) -
    Math.PI;

  return a + difference * t;
}

export class RemoteInterpolation {
  delay: number;
  snapshots: TimedSnapshot[];
  constructor(delay = INTERPOLATION_DELAY_MS) {
    this.delay = delay;
    this.snapshots = [];
  }

  addSnapshot(snapshot: RemoteSnapshot | null | undefined, receivedAt = performance.now()): void {
    if (!snapshot || !Number.isFinite(snapshot.tick)) {
      return;
    }

    const previous =
      this.snapshots[this.snapshots.length - 1];

    if (previous && snapshot.tick <= previous.snapshot.tick) {
      return;
    }

    this.snapshots.push({
      snapshot,
      receivedAt,
    });

    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.snapshots.shift();
    }
  }

  getInterpolatedShips(
    localPlayerId: string,
    now = performance.now(),
  ): Record<string, RemoteShip> {
    if (this.snapshots.length === 0) {
      return {};
    }

    const targetTime = now - this.delay;

    let older = this.snapshots[0]!;
    let newer =
      this.snapshots[this.snapshots.length - 1]!;

    for (let i = 1; i < this.snapshots.length; i += 1) {
      if (this.snapshots[i]!.receivedAt >= targetTime) {
        older = this.snapshots[i - 1]!;
        newer = this.snapshots[i]!;
        break;
      }
    }

    const duration =
      newer.receivedAt - older.receivedAt;

    const t =
      duration > 0
        ? Math.max(
            0,
            Math.min(
              1,
              (targetTime - older.receivedAt) / duration,
            ),
          )
        : 1;

    const ships: Record<string, RemoteShip> = {};

    for (const [id, ship] of Object.entries(
      newer.snapshot.ships ?? {},
    )) {
      if (id === localPlayerId) {
        continue;
      }

      const previousShip =
        older.snapshot.ships?.[id];

      if (!previousShip) {
        ships[id] = { ...ship };
        continue;
      }

      ships[id] = {
        ...ship,

        x: interpolateWrapped(
          previousShip.x,
          ship.x,
          t,
          WORLD_WIDTH,
        ),

        y: interpolateWrapped(
          previousShip.y,
          ship.y,
          t,
          WORLD_HEIGHT,
        ),

        angle: interpolateAngle(
          previousShip.angle,
          ship.angle,
          t,
        ),
      };
    }

    return ships;
  }

  reset(): void {
    this.snapshots = [];
  }
}
