import { z } from 'zod';
import { assertNever } from './index.js';
export const InputSchema = z.object({ type: z.literal('input'), seq: z.number().int().min(1).max(0xffffffff), thrust: z.boolean(), left: z.boolean(), right: z.boolean(), shoot: z.boolean() }).strict();
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict(),
  z.object({ type: z.literal('join'), roomId: z.string().min(1), name: z.string().trim().min(1).max(30) }).strict(),
  InputSchema,
  z.object({ type: z.literal('chat'), text: z.string().min(1).max(500) }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export function parseClientMessage(value: unknown): ClientMessage | null {
  const result = ClientMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
export function messageKind(message: ClientMessage): string {
  switch (message.type) {
    case 'ping': return 'ping';
    case 'join': return 'join';
    case 'input': return 'input';
    case 'chat': return 'chat';
    case 'leave': return 'leave';
    default: return assertNever(message);
  }
}
