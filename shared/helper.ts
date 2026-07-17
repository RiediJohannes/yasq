import { Participant } from "./types";

export function getAvatarUrl(participant: Participant) {
  return participant.avatar
    ? `https://cdn.discordapp.com/avatars/${participant.id}/${participant.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(participant.id) >> 22n) % 6}.png`;
}

export function getDisplayName(participant: Participant) {
  return participant.nickname || participant.global_name || participant.username;
}