import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChannelType } from 'discord-api-types/v10';
import { execSync } from 'child_process';

import { validateToken, invalidateToken, filterDiscordTextChannels, getAudioDuration } from './helper.js';

describe('validateToken', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_MOCK_MODE', 'false');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    invalidateToken('test_token');
  });

  it('should handle the full token lifecycle: fetch, cache, and expire', async () => {
    const mockUser = { id: 'discord_123' };
    const token = 'test_token';

    const mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockUser),
      } as Response)
    );
    vi.stubGlobal('fetch', mockFetch);

    // 1. Fetch
    const firstResult = await validateToken(token);
    expect(firstResult).toBe('discord_123');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 2. Load from Cache
    mockFetch.mockClear();

    const secondResult = await validateToken(token);
    expect(secondResult).toBe('discord_123');
    expect(mockFetch).toHaveBeenCalledTimes(0);

    // 3. Fetch again after token expired
    vi.advanceTimersByTime(11 * 60 * 1000);

    const thirdResult = await validateToken(token);
    expect(thirdResult).toBe('discord_123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should use Mock Mode logic when VITE_MOCK_MODE is true', async () => {
    vi.stubEnv('VITE_MOCK_MODE', 'true');

    const result = await validateToken('mock_999');
    expect(result).toBe('999');
  });
});

describe('filterDiscordTextChannels', () => {
  const mockChannels = [
    { id: '1', type: ChannelType.GuildCategory, name: 'category 1' },
    {
      id: '2',
      type: ChannelType.GuildText,
      name: 'text channel 1',
      parent_id: '1',
    },
    {
      id: '3',
      type: ChannelType.GuildText,
      name: 'text channel 2',
      parent_id: '1',
    },
    { id: '4', type: ChannelType.GuildCategory, name: 'category 2' },
    {
      id: '5',
      type: ChannelType.GuildText,
      name: 'text channel 3',
      parent_id: '4',
    },
    {
      id: '6',
      type: ChannelType.GuildText,
      name: 'text channel 4',
      parent_id: null,
    }, // No category
    { id: '7', type: ChannelType.GuildVoice, name: 'voice channel 1' },
  ];

  it('should filter only type 0 channels and sort them by category then name', () => {
    const result = filterDiscordTextChannels(mockChannels as any[]);

    // Verify filtering
    expect(result.length).toBe(4);
    expect(result.every(c => c.id !== '1' && c.id !== '4' && c.id !== '7')).toBe(true);

    // Verify sorting order
    expect(result[0]!.name).toBe('text channel 4');
    expect(result[0]!.category).toBe('');

    expect(result[1]!.name).toBe('text channel 1');
    expect(result[1]!.category).toBe('category 1');

    expect(result[2]!.name).toBe('text channel 2');
    expect(result[2]!.category).toBe('category 1');

    expect(result[3]!.name).toBe('text channel 3');
    expect(result[3]!.category).toBe('category 2');
  });

  it('should handle an empty array gracefully', () => {
    expect(filterDiscordTextChannels([])).toEqual([]);
  });
});

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('getAudioDuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly format valid seconds output from ffprobe', () => {
    // Mock execSync to return 135.5 seconds (2 minutes 15 seconds)
    vi.mocked(execSync).mockReturnValue('135.5\n' as any);

    const duration = getAudioDuration('/path/to/track.mp3');

    expect(duration).toBe('2:15');
    expect(execSync).toHaveBeenCalledWith(expect.stringContaining('ffprobe'), expect.any(Object));
  });

  it('should pad single-digit seconds correctly', () => {
    // Mock execSync to return 65 seconds (1 minute 5 seconds)
    vi.mocked(execSync).mockReturnValue('65\n' as any);

    const duration = getAudioDuration('/path/to/track.mp3');

    expect(duration).toBe('1:05');
  });

  it('should return "Unknown" if ffprobe returns non-numeric output', () => {
    vi.mocked(execSync).mockReturnValue('N/A\n' as any);

    const duration = getAudioDuration('/path/to/track.mp3');

    expect(duration).toBe('Unknown');
  });

  it('should return "Unknown" if execSync throws an error (e.g. file missing or ffprobe error)', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Command failed');
    });

    const duration = getAudioDuration('/path/to/missing.mp3');

    expect(duration).toBe('Unknown');
  });
});
