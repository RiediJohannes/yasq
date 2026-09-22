import type { Participant } from './types.js';

export function getAvatarUrl(participant: Participant) {
  return participant.avatar
    ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(participant.id) >> 22n) % 6}.png`;
}

export function getDisplayName(participant: Participant) {
  return participant.nickname || participant.global_name || participant.username;
}

// Reusable comparator to order variants of the same enum in the order they were defined in
export const sortByEnumOrder = <T extends string>(enumObj: Record<string, T>) => {
  const order = Object.values(enumObj);
  return (a: T, b: T) => order.indexOf(a) - order.indexOf(b);
};

export interface SerializedError {
  name: string;
  message: string;
  stack?: string | undefined;
}

export function serializeError(err: Error): SerializedError {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
}

export function deserializeError(payload: SerializedError): Error | string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string') return payload;

  if (typeof payload === 'object') {
    const { name, message, stack } = payload;

    if (message || stack) {
      const err = new Error(message || 'Unknown Client Error');
      if (name) err.name = name;
      if (stack) err.stack = stack;
      return err;
    }
  }

  return String(payload);
}
