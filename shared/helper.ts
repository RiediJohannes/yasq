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
