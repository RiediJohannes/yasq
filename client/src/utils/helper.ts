import { Participant } from "@yasq/shared";

const userCache = new Map<string, Participant>();

export function findUser(participants: Participant[], userId: string): Participant {
  const realUser = participants.find(p => p.id === userId);

  // Return user if present in game
  if (realUser) {
    userCache.set(userId, realUser);
    return realUser;
  }

  // Lookup cache if not present in game
  return userCache.get(userId) || { id: "0", username: "Unknown" };
}

export function getUserId(auth: any) {
  if (!auth || !auth.user) {
    return null;
  }
  return auth.user.id;
}

export function capitalize(str: string) {
  return str.toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatBonusMultiplier(rate: number): string {
  if (rate === 0) return "Off";
  const percent = (Math.round(rate * 100 * 10) / 10).toFixed(1);
  return `+${percent}%`;
}

export const getActionKeyLabel = (isMac: boolean) => {
  return isMac ? '⌘' : 'Alt';
};