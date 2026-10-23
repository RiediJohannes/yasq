import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { loadPermissions, isAllowed } from './permissions.js';
import { ValidationError } from '../utils/validate_config.js';

const PLAYER_1 = 'player_123';
const PLAYER_2 = 'player_456';
const PLAYER_3 = 'player_789';

const TRACK_1 = 'track_123.mp3';
const TRACK_2 = 'track_456.mp3';
const TRACK_3 = 'track_789.mp3';

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
        files: [TRACK_1],
      },
    ]);

    // 2. Mock fs.existsSync and fs.readFileSync
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockData);

    loadPermissions('whitelist.json');

    expect(isAllowed(PLAYER_1, TRACK_1)).toBe(true); // Whitelisted
    expect(isAllowed(PLAYER_2, TRACK_1)).toBe(false); // Not whitelisted
  });

  it('should correctly parse a blacklist from JSON', () => {
    const mockData = JSON.stringify([
      {
        type: 'blacklist',
        userIds: [PLAYER_1],
        files: [TRACK_2],
      },
    ]);

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(mockData);

    loadPermissions('blacklist.json');

    expect(isAllowed(PLAYER_1, TRACK_2)).toBe(false); // Blacklisted
    expect(isAllowed(PLAYER_2, TRACK_2)).toBe(true); // Not blacklisted
  });

  it('should throw an error and start with no restrictions if file is invalid', () => {
    const invalidPermissions = [
      {
        type: 'greylist', // Invalid: must be blacklist or whitelist
        userIds: '1', // Invalid: not an array
        files: ['track001.mp3'],
      },
      {
        type: 'whitelist',
        // Invalid: userIds missing
        files: [1], // Invalid: array must contain strings
      },
    ];

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidPermissions));

    let error: unknown;
    try {
      loadPermissions('missing-permissions.json');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const errorMessage = (error as ValidationError).message;

    expect(errorMessage).toContain(
      "Found 4 invalid configuration properties in permissions file 'missing-permissions.json':"
    );
    expect(errorMessage).toContain(
      '1. Item 1: Property \'type\' received invalid value "greylist" (Invalid option: expected one of "whitelist"|"blacklist").'
    );
    expect(errorMessage).toContain(
      '2. Item 1: Property \'userIds\' received invalid value "1" (Invalid input: expected array, received string).'
    );
    expect(errorMessage).toContain("3. Item 2: Property 'userIds' is missing (Required).");
    expect(errorMessage).toContain(
      "4. Item 2: Property 'files.0' received invalid value 1 (Invalid input: expected string, received number)."
    );

    expect(isAllowed(PLAYER_3, TRACK_3)).toBe(true);
  });

  it('should throw an error and start with no restrictions if file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    let error: unknown;
    try {
      loadPermissions('missing-permissions.json');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const errorMessage = (error as ValidationError).message;

    expect(errorMessage).toContain("Permissions file not found at 'missing-permissions.json'.");

    expect(isAllowed(PLAYER_3, TRACK_3)).toBe(true);
  });
});
