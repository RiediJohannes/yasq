import { describe, expect, it } from 'vitest';

import { Participant } from '@yasq/shared';

import { findUser, formatBonusMultiplier, getActionKeyLabel, getGameDuration, getStreakTier } from './helper';

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
