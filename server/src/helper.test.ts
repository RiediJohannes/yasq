import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateToken, invalidateToken } from './helper.js';

describe('validateToken', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_MOCK_MODE', 'false');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    invalidateToken("test_token");
  });

  it('should handle the full token lifecycle: fetch, cache, and expire', async () => {
    const mockUser = { id: 'discord_123' };
    const token = "test_token";

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

    const result = await validateToken("mock_999");
    expect(result).toBe("999");
  });
});