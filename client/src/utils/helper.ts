import { Participant } from '@yasq/shared';

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

export function UrlToAudioSource(url: string | null): string {
  if (!url) return '';

  try {
    return new URL(url, window.location.origin).href;
  } catch {
    return '';
  }
}

export function formatBonusMultiplier(rate: number, nullValue = 'Off'): string {
  if (rate === 0) return nullValue;
  const percent = (Math.round(rate * 100 * 10) / 10).toFixed(1);
  return `+${percent}%`;
}

export const getActionKeyLabel = (isMac: boolean) => {
  return isMac ? '⌘' : 'Alt';
};

export const getStreakTier = (streak: number): number => {
  return Math.min(Math.ceil(streak / 2), 4);
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

/** Extracts the x-coordinate in client viewport pixels from a mouse or touch event. */
export const getPointerX = (e: MouseEvent | TouchEvent): number | null => {
  if ('touches' in e) {
    if (e.touches && e.touches.length > 0) {
      return e.touches[0].clientX;
    }
    return null;
  }
  return e.clientX;
};

/**
 * Finds the item whose value is closest to the target value using binary search.
 * The items MUST be sorted in ascending order by the value returned by `getItemValue`.
 *
 * @returns The closest item, its index, and its absolute distance to the target value.
 *          For an empty array: `{ item: null, index: -1, distance: Infinity }`.
 *          On an exact tie, the item with the lower index wins.
 */
export function binarySearchClosestItem<Item>(
  sortedItems: readonly Item[],
  targetValue: number,
  getItemValue: (item: Item) => number = (item: Item) => Number(item)
): { item: Item | null; index: number; distance: number } {
  if (sortedItems.length === 0) return { item: null, index: -1, distance: Infinity };

  // Find the first item whose value is >= the target value (or the last item if there is none)
  let lowerIndex = 0;
  let upperIndex = sortedItems.length - 1;
  while (lowerIndex < upperIndex) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
    if (getItemValue(sortedItems[middleIndex]) < targetValue) {
      lowerIndex = middleIndex + 1;
    } else {
      upperIndex = middleIndex;
    }
  }

  // The closest item is either that item or its predecessor
  let closestIndex = lowerIndex;
  let closestDistance = Math.abs(getItemValue(sortedItems[lowerIndex]) - targetValue);

  if (lowerIndex > 0) {
    const predecessorDistance = Math.abs(getItemValue(sortedItems[lowerIndex - 1]) - targetValue);
    if (predecessorDistance <= closestDistance) {
      closestIndex = lowerIndex - 1;
      closestDistance = predecessorDistance;
    }
  }

  return { item: sortedItems[closestIndex], index: closestIndex, distance: closestDistance };
}

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
