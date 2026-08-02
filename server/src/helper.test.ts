import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateToken, invalidateToken, filterDiscordTextChannels } from './helper.js';
import { ChannelType } from 'discord-api-types/v10';

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
