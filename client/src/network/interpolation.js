
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '@space-arena/shared';

const INTERPOLATION_DELAY_MS = 100;
const MAX_SNAPSHOTS = 20;

function interpolateWrapped(a, b, t, size) {
  let difference = b - a;

  if (difference > size / 2) {
    difference -= size;
  } else if (difference < -size / 2) {
    difference += size;
  }

  return ((a + difference * t) % size + size) % size;
}

function interpolateAngle(a, b, t) {
  let difference = b - a;

  difference =
    ((difference + Math.PI) % (Math.PI * 2) +
      Math.PI * 2) %
      (Math.PI * 2) -
    Math.PI;

  return a + difference * t;
}

export class RemoteInterpolation {
  constructor(delay = INTERPOLATION_DELAY_MS) {
    this.delay = delay;
    this.snapshots = [];
  }

  addSnapshot(snapshot, receivedAt = performance.now()) {
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
    localPlayerId,
    now = performance.now(),
  ) {
    if (this.snapshots.length === 0) {
      return {};
    }

    const targetTime = now - this.delay;

    let older = this.snapshots[0];
    let newer =
      this.snapshots[this.snapshots.length - 1];

    for (let i = 1; i < this.snapshots.length; i += 1) {
      if (this.snapshots[i].receivedAt >= targetTime) {
        older = this.snapshots[i - 1];
        newer = this.snapshots[i];
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

    const ships = {};

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

  reset() {
    this.snapshots = [];
  }
}
