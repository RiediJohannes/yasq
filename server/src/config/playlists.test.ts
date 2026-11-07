import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

import { LogCategory, logger } from '../utils/logger.js';
import { setServerRootDir } from '../utils/helper.js';
import { loadPlaylists } from './playlists.js';
import { ValidationError } from './validate_config.js';

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

describe('loadPlaylists', () => {
  it('should load valid playlists file', () => {
    const customPlaylists = [
      {
        name: 'Playlist 1',
        tracks: ['track001.mp3', 'track002.mp3'],
      },
      {
        name: 'Playlist 2',
        tracks: ['track003.mp3'],
      },
    ];

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(customPlaylists));

    const result = loadPlaylists('playlists.json');

    expect(result).toEqual(customPlaylists);
    expect(debugSpy).toHaveBeenCalledWith("Loading playlists from 'playlists.json'.", LogCategory.SETUP);
  });

  it('should throw an error on invalid playlist properties', () => {
    const invalidPlaylists = [
      {
        name: '', // Invalid: empty string
        tracks: 'track001.mp3', // Invalid: not an array
      },
      {
        name: 'Playlist 2',
        tracks: ['track003.mp3'], // Invalid: audio file does not exist
      },
    ];

    vi.mocked(fs.existsSync).mockImplementation(filePath => {
      return !String(filePath).endsWith('track003.mp3');
    });
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidPlaylists));

    let error: unknown;
    try {
      loadPlaylists('invalid.json');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const errorMessage = (error as ValidationError).message;

    expect(errorMessage).toContain("Found 3 invalid configuration properties in playlists file 'invalid.json':");
    expect(errorMessage).toContain(
      '1. Item 1: Property \'name\' received invalid value "" (Too small: expected string to have >=1 characters).'
    );
    expect(errorMessage).toContain(
      '2. Item 1: Property \'tracks\' received invalid value "track001.mp3" (Invalid input: expected array, received string).'
    );
    expect(errorMessage).toContain(
      "3. Item 2: Property 'tracks.0' received invalid value \"track003.mp3\" (File path escapes the designated directory ('music') or does not exist)."
    );
  });

  it('should throw an error when playlist file is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    let error: unknown;
    try {
      loadPlaylists('missing-playlists.json');
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const errorMessage = (error as ValidationError).message;

    expect(errorMessage).toContain("Playlists file not found at 'missing-playlists.json'.");
  });
});
