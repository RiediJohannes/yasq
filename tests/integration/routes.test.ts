import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest';
import { assignNewHost, playTrack, setBaseUrl, setupGame, submitGuess, useJoker } from '../../client/src/utils/backend';
import { setupServer } from '../../server';
import { FirstBonusMultiplier, GameState, Joker, StreakBonusMultiplier, TimeBonus } from '@yasq/shared';
import type { Server } from 'http';
import { AddressInfo } from 'net';
import { TestApi } from '../utils/api.js';
import { exchangeCodeForToken, getDiscordUser } from '../../server/src/utils/discord';

const hostToken = 'token_1';
const player1Token = 'token_2';
const player2Token = 'token_3';
const nonRegisteredPlayerToken = 'token_4';

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

  await new Promise<void>(resolve => {
    httpServer.listen(0, () => {
      // Get the port assigned by the OS
      const address = httpServer.address() as AddressInfo;
      const port = address.port;

      baseUrl = `http://localhost:${port}`;
      setBaseUrl(baseUrl);
      resolve();
    });
  });

  vi.mocked(exchangeCodeForToken).mockResolvedValue('mock_token_for_dev');
  vi.mocked(getDiscordUser).mockImplementation(async (access_token: string) => {
    const id = access_token.split('_')[1];
    return {
      id,
      username: `TestUser${id}`,
    };
  });
});

afterAll(async () => {
  if (httpServer) {
    await new Promise<void>(resolve => httpServer.close(() => resolve()));
  }
});

beforeEach(async context => {
  currentInstanceId = `test-instance-${context.task.id}`;
  api = new TestApi(baseUrl, currentInstanceId, true);
});

describe('assignNewHost', () => {
  beforeEach(async () => {
    await api.setupSession(
      [
        { id: '1', username: 'Player1' },
        { id: '2', username: 'Player2' },
      ],
      GameState.SETUP
    );
  });

  afterEach(async () => {
    await api.deleteSession();
  });

  it('should return 200 OK when host is assigned by current host', async () => {
    const response = await assignNewHost(hostToken, currentInstanceId, '2');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('success');
  });

  it('should return 403 Forbidden when non-host player tries to assign host', async () => {
    const response = await assignNewHost(player1Token, currentInstanceId, '2');
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Only host can perform this action');
  });

  it('should return 400 Bad Request when assigning host to non-registered player', async () => {
    const response = await assignNewHost(hostToken, currentInstanceId, '3');
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('New host must be a registered user');
  });
});

describe('setupGame', () => {
  beforeEach(async () => {
    await api.setupSession(
      [
        { id: '1', username: 'Player1' },
        { id: '2', username: 'Player2' },
      ],
      GameState.SETUP
    );
  });

  afterEach(async () => {
    await api.deleteSession();
  });

  it('should return 200 OK when valid settings are provided', async () => {
    const response = await setupGame(hostToken, currentInstanceId, {
      rounds: 5,
      trackDuration: 60,
      enabledJokers: [],
      firstBonusMultiplier: FirstBonusMultiplier.OFF,
      timeBonus: TimeBonus.LINEAR,
      streakBonusMultiplier: StreakBonusMultiplier.OFF,
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toContain('LOBBY');
  });

  it('should return 400 Bad Request when rounds are set to 0', async () => {
    const response = await setupGame(hostToken, currentInstanceId, {
      rounds: 0,
      trackDuration: 60,
      enabledJokers: [],
      firstBonusMultiplier: FirstBonusMultiplier.OFF,
      timeBonus: TimeBonus.LINEAR,
      streakBonusMultiplier: StreakBonusMultiplier.OFF,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Rounds and track duration must be greater than 0.');
  });

  it('should return 400 Bad Request when track duration exceeds the maximum allowed value', async () => {
    const response = await setupGame(hostToken, currentInstanceId, {
      rounds: 5,
      trackDuration: 999999999,
      enabledJokers: [],
      firstBonusMultiplier: FirstBonusMultiplier.OFF,
      timeBonus: TimeBonus.LINEAR,
      streakBonusMultiplier: StreakBonusMultiplier.OFF,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Track duration must not exceed');
  });

  it('should return 403 Forbidden when non-host player tries to setup game', async () => {
    const response = await setupGame(player1Token, currentInstanceId, {
      rounds: 5,
      trackDuration: 60,
      enabledJokers: [],
      firstBonusMultiplier: FirstBonusMultiplier.OFF,
      timeBonus: TimeBonus.LINEAR,
      streakBonusMultiplier: StreakBonusMultiplier.OFF,
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Only host can perform this action');
  });
});

describe('playTrack', () => {
  beforeEach(async () => {
    await api.setupSession(
      [
        { id: '1', username: 'Player1' },
        { id: '2', username: 'Player2' },
      ],
      GameState.TRACK_SELECTION
    );
  });

  afterEach(async () => {
    await api.deleteSession();
  });

  it('should return 200 OK when valid audio file is requested', async () => {
    const response = await playTrack(hostToken, 'track001.mp3', currentInstanceId);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toContain('PLAYING');
  });

  it('should return 400 Bad Request when invalid audio file is requested', async () => {
    const response = await playTrack(hostToken, 'bla.mp3', currentInstanceId);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Track not found.');
  });

  it('should return 403 Forbidden when non-allowed audio file is requested', async () => {
    const response = await playTrack(hostToken, 'track002.mp3', currentInstanceId);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('You do not have permission to play this track.');
  });

  it('should return 403 Forbidden when non-host player tries to play track', async () => {
    const response = await playTrack(player1Token, 'track002.mp3', currentInstanceId);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Only host can perform this action');
  });
});

describe('submitGuess', () => {
  beforeEach(async () => {
    await api.setupSession(
      [
        { id: '1', username: 'Player1' },
        { id: '2', username: 'Player2' },
      ],
      GameState.PLAYING
    );
  });

  afterEach(async () => {
    await api.deleteSession();
  });

  it('should return 200 OK when guess is submitted by registered player', async () => {
    const response = await submitGuess(player1Token, currentInstanceId, 'guess');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toContain('submitted');
  });

  it('should return 403 Forbidden when guess is submitted by non-registered player', async () => {
    const response = await submitGuess(nonRegisteredPlayerToken, currentInstanceId, 'guess');
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('User not registered in this instance.');
  });

  it('should return 400 Bad Request when submitted guess is too long', async () => {
    const response = await submitGuess(
      player1Token,
      currentInstanceId,
      'thisisaverylongguessthatislongerthantheallowedcharacterlimitof100charactersandisthereforerejectedbytheserver'
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Guess must be between 1 and 100 characters.');
  });
});

describe('useJoker', () => {
  beforeEach(async () => {
    await api.setupSession(
      [
        { id: '1', username: 'Player1' },
        { id: '2', username: 'Player2' },
        { id: '3', username: 'Player3' },
      ],
      GameState.PLAYING,
      {
        settings: {
          trackDuration: 60_000,
        },
        trackInfo: {
          url: 'some url',
          track: {
            game: 'Game A',
            title: 'Track A',
            tags: [
              { type: 'platform', value: 'Platform A' },
              { type: 'release', value: '2026' },
            ],
          },
        },
      }
    );
  });

  afterEach(async () => {
    await api.deleteSession();
  });

  it('should return 200 OK when OBFUSCATION joker is used', async () => {
    await api.patchEnabledJokers([Joker.OBFUSCATION]);

    const response = await useJoker(player1Token, currentInstanceId, Joker.OBFUSCATION);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.OBFUSCATION);
    expect(body.hint.length).toEqual(6);
  });

  it('should return 200 OK when TRIVIA joker is used', async () => {
    await api.patchEnabledJokers([Joker.TRIVIA]);

    const response = await useJoker(player1Token, currentInstanceId, Joker.TRIVIA);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.TRIVIA);
    expect(body.hint).toStrictEqual([
      { type: 'platform', value: 'Platform A' },
      { type: 'release', value: '2026' },
    ]);
  });

  it('should return 200 OK when MULTIPLE_CHOICE joker is used', async () => {
    await api.patchEnabledJokers([Joker.MULTIPLE_CHOICE]);

    const response = await useJoker(player1Token, currentInstanceId, Joker.MULTIPLE_CHOICE);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.MULTIPLE_CHOICE);
    expect(body.hint).toContain('Game A');
  });

  it('should return 200 OK when GLIMPSE joker is used', async () => {
    await api.patchEnabledJokers([Joker.GLIMPSE]);

    await playTrack(hostToken, 'track001.mp3', currentInstanceId);

    const response = await useJoker(player1Token, currentInstanceId, Joker.GLIMPSE);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.GLIMPSE);
    expect(body.hint).toBeDefined();
  });

  it('should return 400 Bad Request when SPY joker is missing targetId', async () => {
    await api.patchEnabledJokers([Joker.SPY]);

    const response = await useJoker(player1Token, currentInstanceId, Joker.SPY);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Spy Joker requires a targetId');
  });

  it('should return 202 Accepted when SPY joker target has not submitted', async () => {
    await api.patchEnabledJokers([Joker.SPY]);

    const response = await useJoker(player1Token, currentInstanceId, Joker.SPY, '3');
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.error).toContain("Target hasn't submitted yet.\nJoker not consumed.");
  });

  it('should return 200 OK when SPY joker is used with valid target', async () => {
    await api.patchEnabledJokers([Joker.SPY]);

    await submitGuess(player2Token, currentInstanceId, 'guess');
    const response = await useJoker(player1Token, currentInstanceId, Joker.SPY, '3');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.SPY);
    expect(body.hint).toEqual('guess');
  });

  it('should return 403 Forbidden when joker is not enabled', async () => {
    await api.patchEnabledJokers([Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.SPY]);

    const response = await useJoker(player1Token, currentInstanceId, Joker.OBFUSCATION);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Joker not enabled for this game');
  });

  it('should return 403 Forbidden when joker already used', async () => {
    await api.patchEnabledJokers([Joker.OBFUSCATION]);

    await useJoker(player1Token, currentInstanceId, Joker.OBFUSCATION);
    const response = await useJoker(player1Token, currentInstanceId, Joker.OBFUSCATION);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Joker already used');
  });
});
