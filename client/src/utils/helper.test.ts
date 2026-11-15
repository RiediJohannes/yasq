import { describe, expect, it } from 'vitest';

import { Participant } from '@yasq/shared';

import {
  binarySearchClosestItem,
  findUser,
  formatBonusMultiplier,
  getActionKeyLabel,
  getGameDuration,
  getStreakTier,
} from './helper';

const mockParticipants: Participant[] = [
  { id: '1', username: 'MockPlayer1' },
  { id: '2', username: 'MockPlayer2' },
];

describe('findUser', () => {
  it('should return the participant when found in the list and updates cache', () => {
    const user = findUser(mockParticipants, '1');
    expect(user).toEqual({ id: '1', username: 'MockPlayer1' });
  });

  it('should fall back to the userCache if participant is not in the current list', () => {
    // First, populate cache by finding user "1"
    findUser(mockParticipants, '1');

    // Now pass a participants list that doesn't contain "1"
    const user = findUser([{ id: '2', username: 'MockPlayer1' }], '1');
    expect(user).toEqual({ id: '1', username: 'MockPlayer1' });
  });

  it('should return default unknown user if not in participants list or cache', () => {
    const user = findUser(mockParticipants, '999');
    expect(user).toEqual({ id: '0', username: 'Unknown' });
  });
});

describe('formatBonusMultiplier', () => {
  it("should return 'Off' when rate is 0", () => {
    expect(formatBonusMultiplier(0)).toBe('Off');
  });

  it('should correctly format rate into percentage string', () => {
    expect(formatBonusMultiplier(0.2)).toBe('+20.0%');
    expect(formatBonusMultiplier(0.1555)).toBe('+15.6%');
  });
});

describe('getActionKeyLabel', () => {
  it('should return command symbol for Mac', () => {
    expect(getActionKeyLabel(true)).toBe('⌘');
  });

  it('should return Alt for non-Mac', () => {
    expect(getActionKeyLabel(false)).toBe('Alt');
  });
});

describe('getGameDuration', () => {
  it('should return "N/A" if startTime or endTime is null', () => {
    expect(getGameDuration(null, 1000)).toBe('N/A');
    expect(getGameDuration(1000, null)).toBe('N/A');
  });

  it('should correctly calculate duration in minutes and seconds', () => {
    const startTime = 0;
    const endTime = 125000; // 2 minutes and 5 seconds
    expect(getGameDuration(startTime, endTime)).toBe('2m 5s');
  });
});

describe('getStreakTier', () => {
  it.each([
    [2, 1],
    [4, 2],
    [6, 3],
    [8, 4],
  ])('should return the correct streak tier for an even number (%i -> %i)', (streak, expected) => {
    expect(getStreakTier(streak)).toBe(expected);
  });

  it.each([
    [1, 1],
    [3, 2],
    [5, 3],
    [7, 4],
  ])('should return the correct streak tier for an odd number (%i -> %i)', (streak, expected) => {
    expect(getStreakTier(streak)).toBe(expected);
  });

  it.each([
    [8, 4],
    [9, 4],
    [10, 4],
    [20, 4],
    [10_0001, 4],
  ])('should not exceed the maximum streak tier (%i -> %i)', (streak, expected) => {
    expect(getStreakTier(streak)).toBe(expected);
  });
});

describe('binarySearchClosestItem', () => {
  describe('Edge Cases', () => {
    it('should return a null item, -1 index, and infinite distance given an empty list', () => {
      expect(binarySearchClosestItem([], 42)).toEqual({
        item: null,
        index: -1,
        distance: Infinity,
      });
    });

    it('should always return the single list item if it is the only option', () => {
      expect(binarySearchClosestItem([7], 100)).toEqual({ item: 7, index: 0, distance: 93 });
      expect(binarySearchClosestItem([7], -5)).toEqual({ item: 7, index: 0, distance: 12 });
      expect(binarySearchClosestItem([7], 7)).toEqual({ item: 7, index: 0, distance: 0 });
    });

    it('should prefer the lower index on an exact midpoint tie', () => {
      const { item, index } = binarySearchClosestItem([1, 3, 5, 7], 4);
      expect(item).toBe(3);
      expect(index).toBe(1);
    });

    it('should prefer the first of equally close values', () => {
      const { item, index } = binarySearchClosestItem([5, 5, 5, 5], 5);
      expect(item).toBe(5);
      expect(index).toBe(0);
    });

    it('should auto-coerce strings into numbers if no custom getItemValue function is provided', () => {
      const { item, index } = binarySearchClosestItem(['1', '3', '6', '9'], 4);
      expect(item).toBe('3');
      expect(index).toBe(1);
    });
  });

  describe('Standard Number Cases', () => {
    it.each([
      { name: 'Exact match', items: [1, 3, 5, 7], target: 5, expectedIndex: 2 },
      { name: 'Below everything -> first item', items: [1, 3, 5, 7], target: 0, expectedIndex: 0 },
      { name: 'Above everything -> last item', items: [1, 3, 5, 7], target: 100, expectedIndex: 3 },
      { name: 'Closest to 13', items: [1, 3, 6, 8, 13, 15], target: 11, expectedIndex: 4 },
    ])('$name (target $target -> index $expectedIndex)', ({ items, target, expectedIndex }) => {
      const result = binarySearchClosestItem(items, target);
      expect(result.index).toBe(expectedIndex);
      expect(result.item).toBe(items[expectedIndex]);
      expect(result.distance).toBe(Math.abs(items[expectedIndex]! - target));
    });
  });

  describe('Custom getItemValue Function', () => {
    type TimePoint = { time: number; label: string };

    const points: TimePoint[] = [
      { time: 1000, label: 'A' },
      { time: 4000, label: 'B' },
      { time: 9000, label: 'C' },
    ];
    const getTime = (p: TimePoint) => p.time;

    it('should find the closest point by mapped value', () => {
      const { item, index, distance } = binarySearchClosestItem(points, 3500, getTime);
      expect(item).toEqual({ time: 4000, label: 'B' });
      expect(index).toBe(1);
      expect(distance).toBe(500);
    });

    it('should snap to the first point for targets before the domain', () => {
      const { item, index } = binarySearchClosestItem(points, 0, getTime);
      expect(item?.label).toBe('A');
      expect(index).toBe(0);
    });
  });
});
