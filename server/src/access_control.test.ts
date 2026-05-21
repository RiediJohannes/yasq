import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { loadPermissions, isAllowed } from './access_control.js';

const PLAYER_1 = "player_123"
const PLAYER_2 = "player_456"
const PLAYER_3 = "player_789"

const TRACK_1 = "track_123.mp3"
const TRACK_2 = "track_456.mp3"
const TRACK_3 = "track_789.mp3"

vi.mock('fs');

describe('isAllowed', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should correctly parse a whitelist from JSON', () => {
    const mockData = JSON.stringify([
      {
          type: 'whitelist',
          userIds: [PLAYER_1],
          files: [TRACK_1]
      }
    ]);

    // 2. Mock fs.existsSync and fs.readFileSync
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockData);

    loadPermissions();

    expect(isAllowed(PLAYER_1, TRACK_1)).toBe(true);  // Whitelisted
    expect(isAllowed(PLAYER_2, TRACK_1)).toBe(false); // Not whitelisted
  });

  it('should correctly parse a blacklist from JSON', () => {
    const mockData = JSON.stringify([
      {
        type: 'blacklist',
        userIds: [PLAYER_1],
        files: [TRACK_2]
      }
    ]);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockData);

    loadPermissions();

    expect(isAllowed(PLAYER_1, TRACK_2)).toBe(false); // Blacklisted
    expect(isAllowed(PLAYER_2, TRACK_2)).toBe(true);  // Not blacklisted
  });

  it('should start with no restrictions if file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    loadPermissions();

    expect(isAllowed(PLAYER_3, TRACK_3)).toBe(true);
  });
});