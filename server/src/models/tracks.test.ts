import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

import { LogCategory, logger } from '../utils/logger.js';
import { loadTracks } from './tracks.js';
import { setServerRootDir } from '../utils/helper.js';
import { ValidationError } from '../utils/validate_config.js';

vi.mock('fs');

const serverDir: string = process.cwd();

let debugSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  setServerRootDir(serverDir);
});

beforeEach(() => {
  vi.resetAllMocks();
  debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadTrackas', () => {
  it('should load valid tracks file', () => {
    const customConfig = [
      {
        game: 'Game A',
        title: 'Track A',
        audio: 'track001.mp3',
        cover: 'game_a.jpg',
        tags: [
          { type: 'platform', value: 'Platform A' },
          { type: 'release', value: '2024' },
        ],
      },
      {
        game: 'Game B',
        title: 'Track B',
        audio: 'track002.mp3',
      },
    ];

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(customConfig));

    const result = loadTracks('custom.json');

    expect(result).toEqual([
      {
        game: 'Game A',
        title: 'Track A',
        audio: 'track001.mp3',
        cover: 'game_a.jpg',
        tags: [
          { type: 'platform', value: 'Platform A' },
          { type: 'release', value: '2024' },
        ],
      },
      {
        game: 'Game B',
        title: 'Track B',
        audio: 'track002.mp3',
      },
    ]);
    expect(debugSpy).toHaveBeenCalledWith("Loading tracks from 'custom.json'.", LogCategory.SETUP);
  });

  it('should list invalid properties', () => {
    const invalidConfig = [
      {
        game: '', // Invalid: empty string
        title: 2, // Invalid: number
        audio: 'track001.mp3',
      },
      {
        game: 'Game B',
        title: 'Track B',
        audio: 'track002.mp3', // Invalid: audio file does not exist
      },
    ];

    vi.mocked(fs.existsSync).mockImplementation(filePath => {
      if (String(filePath).endsWith('track002.mp3')) return false;
      return true;
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));

    let error: unknown;
    try {
      loadTracks('invalid.json');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const errorMessage = (error as ValidationError).message;

    expect(errorMessage).toContain("Found 3 invalid configuration properties in 'invalid.json':");
    expect(errorMessage).toContain(
      '1. Item 1: Property \'game\' received invalid value "" (Too small: expected string to have >=1 characters).'
    );
    expect(errorMessage).toContain(
      "2. Item 1: Property 'title' received invalid value 2 (Invalid input: expected string, received number)"
    );
    expect(errorMessage).toContain(
      '3. Item 2: Property \'audio\' received invalid value "track002.mp3" (Audio file does not exist in the designated track audio directory).'
    );
    expect((error as ValidationError).exitCode).toBe(22);
  });

  it('should list missing properties', () => {
    const missingConfig = [
      {
        // 'game' is completely missing
        title: 'Track A',
        audio: 'track001.mp3',
      },
    ];

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(missingConfig));

    let error: unknown;
    try {
      loadTracks('missing.json');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const errorMessage = (error as ValidationError).message;

    expect(errorMessage).toContain("Found 1 invalid configuration property in 'missing.json':");
    expect(errorMessage).toContain("1. Item 1: Property 'game' is missing (Required)");
    expect((error as ValidationError).exitCode).toBe(22);
  });

  it('should throw an error when tracks file is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    let error: unknown;
    try {
      loadTracks('missing-tracks.json');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const validationError = error as ValidationError;
    expect(validationError.message).toContain("Tracks file not found at 'missing-tracks.json'.");
    expect(validationError.exitCode).toBe(20);
  });
});
