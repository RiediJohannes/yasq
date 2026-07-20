import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest';
import { setBaseUrl, setupGame, submitGuess, useJoker } from '../../client/src/utils/backend';
import { setupServer } from '../../server';
import { FirstBonusMultiplier, Joker, StreakBonusMultiplier, TimeBonus } from '@yasq/shared';
import type { Server } from 'http';
import { AddressInfo } from 'net';
import { TestApi } from '../utils/api.js';
import { exchangeCodeForToken, getDiscordUser } from '../../server/src/utils/discord';

let httpServer: Server;
let baseUrl: string;
let currentInstanceId: string;
let api: TestApi;

vi.mock('../../server/src/utils/discord', () => ({
  exchangeCodeForToken: vi.fn(),
  getDiscordUser: vi.fn(),
}));

beforeAll(async () => {
  process.env.VITE_MOCK_MODE = 'true';
  httpServer = setupServer();

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      // Get the port assigned by the OS
      const address = httpServer.address() as AddressInfo;
      const port = address.port;

      baseUrl = `http://localhost:${port}`;
      setBaseUrl(baseUrl);
      resolve();
    });
  });

  vi.mocked(exchangeCodeForToken).mockResolvedValue("mock_token_for_dev");
  vi.mocked(getDiscordUser).mockImplementation(async (access_token: string) => {
    const id = access_token.split('_')[1];
    return {
      id,
      username: `TestUser${id}`
    };
  });
});

afterAll(async () => {
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});

beforeEach(async (context) => {
  currentInstanceId = `test-instance-${context.task.id}`;
  api = new TestApi(baseUrl, currentInstanceId, true);
});

describe('setupGame', () => {

  beforeEach(async () => {
    await api.setupSession([{ id: '1', username: 'TestPlayer' }], 'SETUP');
  });

  afterEach(async () => {
    await api.deleteSession();
  });

  it('should return 200 OK when valid settings are provided', async () => {
    const token = 'token_1';

    const setupRes = await setupGame(token, currentInstanceId,
      {
        rounds: 5,
        trackDuration: 60,
        enabledJokers: [],
        firstBonusMultiplier: FirstBonusMultiplier.OFF,
        timeBonus: TimeBonus.LINEAR,
        streakBonusMultiplier: StreakBonusMultiplier.OFF
      }
    );
    const body = await setupRes.json();

    expect(setupRes.status).toBe(200);
    expect(body.status).toContain('LOBBY');
  });

  it('should return 400 Bad Request when rounds are set to 0', async () => {
    const token = 'token_1';

    const setupRes = await setupGame(token, currentInstanceId,
      {
        rounds: 0,
        trackDuration: 60,
        enabledJokers: [],
        firstBonusMultiplier: FirstBonusMultiplier.OFF,
        timeBonus: TimeBonus.LINEAR,
        streakBonusMultiplier: StreakBonusMultiplier.OFF
      }
    );
    const body = await setupRes.json();

    expect(setupRes.status).toBe(400);
    expect(body.error).toContain('Rounds and track duration must be greater than 0.');
  });

  it('should return 400 Bad Request when track duration exceeds the maximum allowed value', async () => {
    const token = 'token_1';

    const setupRes = await setupGame(token, currentInstanceId,
      {
        rounds: 5,
        trackDuration: 999999999,
        enabledJokers: [],
        firstBonusMultiplier: FirstBonusMultiplier.OFF,
        timeBonus: TimeBonus.LINEAR,
        streakBonusMultiplier: StreakBonusMultiplier.OFF
      }
    );
    const body = await setupRes.json();

    expect(setupRes.status).toBe(400);
    expect(body.error).toContain('Track duration must not exceed');
  });
});

describe('submitGuess', () => {

  beforeEach(async () => {
    await api.setupSession([{ id: '1', username: 'TestPlayer' }], 'PLAYING');
  });

  afterEach(async () => {
    await api.deleteSession();
  });

  it('should return 200 OK when guess is submitted by registered player', async () => {
    const token = 'token_1';

    const setupRes = await submitGuess(token, currentInstanceId,
      'guess'
    );
    const body = await setupRes.json();

    expect(setupRes.status).toBe(200);
    expect(body.status).toContain('submitted');
  });

  it('should return 403 Forbidden when guess is submitted by non-registered player', async () => {
    const token = 'token_2';

    const setupRes = await submitGuess(token, currentInstanceId,
      'guess'
    );
    const body = await setupRes.json();

    expect(setupRes.status).toBe(403);
    expect(body.error).toContain('User not registered in this instance.');
  });

  it('should return 400 Bad Request when submitted guess is too long', async () => {
    const token = 'token_1';

    const setupRes = await submitGuess(token, currentInstanceId,
      'thisisaverylongguessthatislongerthantheallowedcharacterlimitof100charactersandisthereforerejectedbytheserver'
    );
    const body = await setupRes.json();

    expect(setupRes.status).toBe(400);
    expect(body.error).toContain('Guess must be between 1 and 100 characters.');
  });
});

describe('useJoker', () => {

  beforeEach(async () => {
    await api.setupSession(
      [{ id: '1', username: 'Player1' }, { id: '2', username: 'Player2' }],
      'PLAYING',
      {
        trackInfo: {
          url: "some url",
          track: {
            game: 'Game A',
            title: 'Track A',
            tags: [
              { 'type': 'platform', 'value': 'Platform A'},
              { 'type': 'release', 'value': '2026'}
            ]
          }
        }
      }
    );
  });

  afterEach(async () => {
    await api.deleteSession();
  });

  it('should return 200 OK when OBFUSCATION joker is used', async () => {
    await api.patchEnabledJokers([Joker.OBFUSCATION]);
    const token = 'token_1';

    const response = await useJoker(token, currentInstanceId, Joker.OBFUSCATION);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.OBFUSCATION);
    expect(body.hint.length).toEqual(6);
  });

  it('should return 200 OK when TRIVIA joker is used', async () => {
    await api.patchEnabledJokers([Joker.TRIVIA]);
    const token = 'token_1';

    const response = await useJoker(token, currentInstanceId, Joker.TRIVIA);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.TRIVIA);
    expect(body.hint).toStrictEqual(
      [
        { type: 'platform', value: 'Platform A' },
        { type: 'release', value: '2026' }
      ]
    )
  });

  it('should return 200 OK when MULTIPLE_CHOICE joker is used', async () => {
    await api.patchEnabledJokers([Joker.MULTIPLE_CHOICE]);
    const token = 'token_1';

    const response = await useJoker(token, currentInstanceId, Joker.MULTIPLE_CHOICE);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.MULTIPLE_CHOICE);
    expect(body.hint).toContain('Game A');
  });

  // TODO: skip for now as we have to call playTrack first to generate the glimpse image
  it.skip('should return 200 OK when GLIMPSE joker is used', async () => {
    await api.patchEnabledJokers([Joker.GLIMPSE]);
    const token = 'token_1';

    const response = await useJoker(token, currentInstanceId, Joker.GLIMPSE);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.GLIMPSE);
    expect(body.hint).toBeDefined();
  });

  it('should return 400 Bad Request when SPY joker is missing targetId', async () => {
    await api.patchEnabledJokers([Joker.SPY]);
    const token = 'token_1';

    const response = await useJoker(token, currentInstanceId, Joker.SPY);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Spy Joker requires a targetId');
  });

  it('should return 202 Accepted when SPY joker target has not submitted', async () => {
    await api.patchEnabledJokers([Joker.SPY]);
    const token = 'token_1';

    const response = await useJoker(token, currentInstanceId, Joker.SPY, '2');
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.error).toContain('Target hasn\'t submitted yet.\nJoker not consumed.');
  });

  it('should return 200 OK when SPY joker is used with valid target', async () => {
    await api.patchEnabledJokers([Joker.SPY]);
    const token1 = 'token_1';
    const token2 = 'token_2';

    await submitGuess(token2, currentInstanceId, 'guess');
    const response = await useJoker(token1, currentInstanceId, Joker.SPY, '2');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.SPY);
    expect(body.hint).toEqual('guess');
  });

  it('should return 403 Forbidden when joker is not enabled', async () => {
    const token = 'token_1';

    const response = await useJoker(token, currentInstanceId, Joker.OBFUSCATION);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Joker not enabled for this game');
  });

  it('should return 403 Forbidden when joker already used', async () => {
    await api.patchEnabledJokers([Joker.OBFUSCATION]);
    const token = 'token_1';

    await useJoker(token, currentInstanceId, Joker.OBFUSCATION);
    const response = await useJoker(token, currentInstanceId, Joker.OBFUSCATION);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Joker already used');
  });
});