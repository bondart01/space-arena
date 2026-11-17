import { describe, expect, it, vi } from 'vitest';
import { Room } from '../src/room.js';

function createRoom(maxPlayers = 2) {
  const room = new Room('test-room', 'Test Room', maxPlayers);

  // Не запускаємо реальний таймер під час тестування.
  vi.spyOn(room.gameLoop, 'start').mockImplementation(() => {});
  vi.spyOn(room.gameLoop, 'stop').mockImplementation(() => {});

  return room;
}

function joinPlayer(room, id = 'p1') {
  return room.join(id, `Player ${id}`, {});
}

const input = (seq, overrides = {}) => ({
  seq,
  thrust: false,
  left: false,
  right: false,
  shoot: false,
  ...overrides,
});

describe('Server room', () => {
  it('creates room with correct configuration', () => {
    const room = createRoom();

    expect(room.id).toBe('test-room');
    expect(room.maxPlayers).toBe(2);
    expect(room.isEmpty).toBe(true);
  });

  it('rejects invalid room configuration', () => {
    expect(() => new Room('', 'Test')).toThrow();
    expect(() => new Room('id', '')).toThrow();
    expect(() => new Room('id', 'Test', 0)).toThrow();
  });

  it('allows player to join', () => {
    const room = createRoom();
    joinPlayer(room);

    expect(room.players.size).toBe(1);
    expect(room.world.ships.p1).toBeDefined();
  });

  it('rejects duplicate player', () => {
    const room = createRoom();
    joinPlayer(room);

    expect(() => joinPlayer(room)).toThrow('Player already joined');
  });

  it('rejects joining full room', () => {
    const room = createRoom(1);
    joinPlayer(room);

    expect(() => joinPlayer(room, 'p2')).toThrow('Room is full');
  });

  it('accepts valid input', () => {
    const room = createRoom();
    joinPlayer(room);

    expect(room.receiveInput('p1', input(1))).toBe(true);
  });

  it('rejects duplicate sequence', () => {
    const room = createRoom();
    joinPlayer(room);

    room.receiveInput('p1', input(1));

    expect(room.receiveInput('p1', input(1))).toBe(false);
  });

  it('rejects invalid sequence', () => {
    const room = createRoom();
    joinPlayer(room);

    expect(() => room.receiveInput('p1', input(0))).toThrow();
    expect(() => room.receiveInput('p1', input(-1))).toThrow();
  });

  it('updates ACK after collecting input', () => {
    const room = createRoom();
    joinPlayer(room);

    room.receiveInput('p1', input(5, { thrust: true }));

    const collected = room.collectInputs();

    expect(collected.p1.seq).toBe(5);
    expect(collected.p1.thrust).toBe(true);
    expect(room.lastProcessedSeq.get('p1')).toBe(5);
  });

  it('removes player and stops empty room', () => {
    const room = createRoom();
    joinPlayer(room);

    expect(room.leave('p1')).toBe(true);
    expect(room.isEmpty).toBe(true);
    expect(room.gameLoop.stop).toHaveBeenCalled();
  });
});

describe('Server input queue protection', () => {
  it('rejects input from unknown player', () => {
    const room = createRoom();

    expect(() => room.receiveInput('unknown', input(1)))
      .toThrow('Player not in room');
  });

  it('rejects input when queue is full', () => {
    const room = createRoom();
    joinPlayer(room);

    for (let seq = 1; seq <= 256; seq++) {
      expect(room.receiveInput('p1', input(seq))).toBe(true);
    }

    expect(room.receiveInput('p1', input(257))).toBe(false);
    expect(room.inputs.get('p1')).toHaveLength(256);
  });

  it('processes commands in correct order', () => {
    const room = createRoom();
    joinPlayer(room);

    room.receiveInput('p1', input(1));
    room.receiveInput('p1', input(2));
    room.receiveInput('p1', input(3));

    expect(room.collectInputs().p1.seq).toBe(1);
    expect(room.collectInputs().p1.seq).toBe(2);
    expect(room.collectInputs().p1.seq).toBe(3);
    expect(room.lastProcessedSeq.get('p1')).toBe(3);
  });

  it('uses neutral input when queue is empty', () => {
    const room = createRoom();
    joinPlayer(room);

    const result = room.collectInputs();

    expect(result.p1).toEqual({
      seq: 0,
      thrust: false,
      left: false,
      right: false,
      shoot: false,
    });
  });

  it('cleans player data after leaving', () => {
    const room = createRoom();
    joinPlayer(room);

    room.receiveInput('p1', input(1));
    room.leave('p1');

    expect(room.players.has('p1')).toBe(false);
    expect(room.inputs.has('p1')).toBe(false);
    expect(room.lastReceivedSeq.has('p1')).toBe(false);
    expect(room.lastProcessedSeq.has('p1')).toBe(false);
    expect(room.world.ships.p1).toBeUndefined();
  });
});

