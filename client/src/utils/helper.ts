import { Participant } from '@yasq/shared';
import { AuthenticationResult } from './connections';

const userCache = new Map<string, Participant>();

export function findUser(participants: Participant[], userId: string): Participant {
  const realUser = participants.find(p => p.id === userId);

  // Return user if present in game
  if (realUser) {
    userCache.set(userId, realUser);
    return realUser;
  }

  // Lookup cache if not present in game
  return userCache.get(userId) || { id: '0', username: 'Unknown' };
}

export function getUserId(auth: AuthenticationResult) {
  if (!auth || !auth.user) {
    return null;
  }
  return auth.user.id;
}

export function capitalize(str: string) {
  return str
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function formatBonusMultiplier(rate: number): string {
  if (rate === 0) return 'Off';
  const percent = (Math.round(rate * 100 * 10) / 10).toFixed(1);
  return `+${percent}%`;
}

export const getActionKeyLabel = (isMac: boolean) => {
  return isMac ? '⌘' : 'Alt';
};

export const getGameDuration = (startTime: number | null, endTime: number | null): string => {
  if (startTime === null || endTime === null) {
    return 'N/A';
  }

  const durationMs = endTime - startTime;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);

  return `${minutes}m ${seconds}s`;
};

export const isTouchDevice = (): boolean => {
  const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  // Legacy fallback
  const hasTouchEvents = 'ontouchstart' in window;

  return isCoarsePointer || hasTouchEvents;
};

/**
 * Blocks on a promise with a maximum timeout for waiting for a result.
 * If the promise finishes before the timeout, its return value is transparently passed on (both in the case of a
 * successful value or an error).
 * If the waiting time exceeds the timeout, the promise is automatically rejected with a timeout error, indicated by
 * the custom `timeoutMessage`.
 */
export function withTimeout<T>(promise: Promise<T>, millis: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), millis);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
