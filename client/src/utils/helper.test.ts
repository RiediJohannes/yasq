import { describe, expect, it } from 'vitest';
import { Participant } from '@yasq/shared';
import { capitalize, findUser, formatBonusMultiplier, getActionKeyLabel, getGameDuration, getUserId } from './helper';
import { AuthenticationResult } from './connections';

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

describe('getUserId', () => {
  it('should return null if auth is null or undefined', () => {
    expect(getUserId(null!)).toBeNull();
    expect(getUserId(undefined!)).toBeNull();
  });

  it('should return null if auth.user is missing', () => {
    expect(getUserId({} as AuthenticationResult)).toBeNull();
  });

  it('should return user id when present', () => {
    const auth = { user: { id: '1' } };
    expect(getUserId(auth as AuthenticationResult)).toBe('1');
  });
});

describe('capitalize', () => {
  it('should properly capitalize snake_case strings', () => {
    expect(capitalize('hello_world')).toBe('Hello World');
  });

  it('should handle single words and casing correctly', () => {
    expect(capitalize('TEST_STRING_value')).toBe('Test String Value');
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
