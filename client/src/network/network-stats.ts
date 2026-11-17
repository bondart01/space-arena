
/* global TextEncoder */
export class NetworkStats {
  rtt: number | null = null;
  jitter = 0;
  lastSnapshotTime: number | null = null;
  snapshotInterval: number | null = null;
  snapshotJitter = 0;
  receivedSnapshots = 0;
  lostSnapshots = 0;
  lastTick: number | null = null;
  sentBytes = 0;
  receivedBytes = 0;
  startedAt = 0;
  constructor() {
    this.reset();
  }

  reset(): void {
    this.rtt = null;
    this.jitter = 0;

    this.lastSnapshotTime = null;
    this.snapshotInterval = null;
    this.snapshotJitter = 0;

    this.receivedSnapshots = 0;
    this.lostSnapshots = 0;
    this.lastTick = null;

    this.sentBytes = 0;
    this.receivedBytes = 0;

    this.startedAt = performance.now();
  }

  // Реєстрація відправленого повідомлення.
  recordSent(message: unknown): void {
    this.sentBytes += new TextEncoder().encode(
      JSON.stringify(message),
    ).byteLength;
  }

  // Реєстрація отриманого повідомлення.
  recordReceived(message: unknown): void {
    this.receivedBytes += new TextEncoder().encode(
      JSON.stringify(message),
    ).byteLength;
  }

  // Вимірювання RTT за відповіддю сервера.
  recordRtt(sampleMs: number): void {
    if (!Number.isFinite(sampleMs) || sampleMs < 0) {
      return;
    }

    if (this.rtt === null) {
      this.rtt = sampleMs;
      return;
    }

    const difference = Math.abs(sampleMs - this.rtt);

    this.jitter =
      this.jitter * 0.8 +
      difference * 0.2;

    this.rtt =
      this.rtt * 0.8 +
      sampleMs * 0.2;
  }

  // Статистика отримання серверних snapshot.
  recordSnapshot(tick: number, now = performance.now()): void {
    this.receivedSnapshots += 1;

    if (this.lastSnapshotTime !== null) {
      const interval = now - this.lastSnapshotTime;

      if (this.snapshotInterval !== null) {
        const difference = Math.abs(
          interval - this.snapshotInterval,
        );

        this.snapshotJitter =
          this.snapshotJitter * 0.8 +
          difference * 0.2;
      }

      this.snapshotInterval = interval;
    }

    if (
      Number.isSafeInteger(tick) &&
      this.lastTick !== null &&
      tick > this.lastTick + 1
    ) {
      this.lostSnapshots +=
        tick - this.lastTick - 1;
    }

    if (
      Number.isSafeInteger(tick) &&
      (this.lastTick === null || tick > this.lastTick)
    ) {
      this.lastTick = tick;
    }

    this.lastSnapshotTime = now;
  }

  // Вік останнього отриманого snapshot.
  getSnapshotAge(now = performance.now()): number | null {
    if (this.lastSnapshotTime === null) {
      return null;
    }

    return now - this.lastSnapshotTime;
  }

  getStats() {
    const elapsedSeconds = Math.max(
      (performance.now() - this.startedAt) / 1000,
      0.001,
    );

    const totalSnapshots =
      this.receivedSnapshots + this.lostSnapshots;

    return {
      rtt: this.rtt,
      jitter: this.jitter,

      snapshotInterval: this.snapshotInterval,
      snapshotJitter: this.snapshotJitter,
      snapshotAge: this.getSnapshotAge(),

      receivedSnapshots: this.receivedSnapshots,
      lostSnapshots: this.lostSnapshots,

      lossPercent:
        totalSnapshots > 0
          ? (this.lostSnapshots / totalSnapshots) * 100
          : 0,

      sentBytes: this.sentBytes,
      receivedBytes: this.receivedBytes,

      averageUploadBps:
        this.sentBytes / elapsedSeconds,

      averageDownloadBps:
        this.receivedBytes / elapsedSeconds,
    };
  }
}
