/** Compile-time contracts for room and room-manager events. */
export type RoomId = string & { readonly __brand: 'RoomId' };
export type PlayerId = string & { readonly __brand: 'PlayerId' };

export interface RoomCreatedEvent {
  readonly roomId: RoomId;
  readonly name: string;
}
export interface RoomDeletedEvent {
  readonly roomId: RoomId;
}

export type RoomLifecycleEvent =
  | { readonly type: 'roomCreated'; readonly payload: RoomCreatedEvent }
  | { readonly type: 'roomDeleted'; readonly payload: RoomDeletedEvent };

export function assertNever(value: never): never {
  throw new Error(`Unexpected event: ${JSON.stringify(value)}`);
}

export function describeRoomLifecycle(event: RoomLifecycleEvent): string {
  switch (event.type) {
    case 'roomCreated':
      return `Room created: ${event.payload.name}`;
    case 'roomDeleted':
      return `Room deleted: ${event.payload.roomId}`;
    default:
      return assertNever(event);
  }
}
