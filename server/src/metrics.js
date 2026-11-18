
import { performance } from 'node:perf_hooks';

export class ServerMetrics {
  constructor() {
    this.startedAt = Date.now();

    this.messagesReceived = 0;
    this.messagesSent = 0;
    this.bytesReceived = 0;
    this.bytesSent = 0;

    this.previousSample = {
      time: performance.now(),
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
    };

    this.previousEventLoop = performance.eventLoopUtilization();
  }

  recordReceived(bytes) {
    this.messagesReceived += 1;
    this.bytesReceived += bytes;
  }

  recordSent(bytes) {
    this.messagesSent += 1;
    this.bytesSent += bytes;
  }

  getMetrics(roomManager) {
    const now = performance.now();
    const elapsedSeconds = Math.max(
      (now - this.previousSample.time) / 1000,
      0.001,
    );

    const memory = process.memoryUsage();

    const eventLoop = performance.eventLoopUtilization(
      this.previousEventLoop,
    );

    this.previousEventLoop = performance.eventLoopUtilization();

    const rooms = [...roomManager.rooms.values()];

    const activePlayers = rooms.reduce(
      (sum, room) => sum + room.players.size,
      0,
    );

    const activeRooms = rooms.filter(
      (room) => room.players.size > 0,
    ).length;

    const tickMetrics = rooms.map((room) => ({
      roomId: room.id,
      roomName: room.name,
      ...room.gameLoop.getMetrics(),
    }));

    const result = {
      uptimeSeconds: Math.round(
        (Date.now() - this.startedAt) / 1000,
      ),

      rooms: {
        total: rooms.length,
        active: activeRooms,
      },

      players: {
        active: activePlayers,
      },

      network: {
        messagesReceivedTotal: this.messagesReceived,
        messagesSentTotal: this.messagesSent,
        bytesReceivedTotal: this.bytesReceived,
        bytesSentTotal: this.bytesSent,

        messagesReceivedPerSecond: Number(
          (
            (this.messagesReceived -
              this.previousSample.messagesReceived) /
            elapsedSeconds
          ).toFixed(2),
        ),

        messagesSentPerSecond: Number(
          (
            (this.messagesSent -
              this.previousSample.messagesSent) /
            elapsedSeconds
          ).toFixed(2),
        ),

        bytesReceivedPerSecond: Number(
          (
            (this.bytesReceived -
              this.previousSample.bytesReceived) /
            elapsedSeconds
          ).toFixed(2),
        ),

        bytesSentPerSecond: Number(
          (
            (this.bytesSent -
              this.previousSample.bytesSent) /
            elapsedSeconds
          ).toFixed(2),
        ),
      },

      eventLoop: {
        utilizationPercent: Number(
          (eventLoop.utilization * 100).toFixed(2),
        ),
      },

      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        heapTotalBytes: memory.heapTotal,
        externalBytes: memory.external,
      },

      gameLoops: tickMetrics,
    };

    this.previousSample = {
      time: now,
      messagesReceived: this.messagesReceived,
      messagesSent: this.messagesSent,
      bytesReceived: this.bytesReceived,
      bytesSent: this.bytesSent,
    };

    return result;
  }
}
