import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationResult, BackendApiFacade } from '../../client/src/backend/apiFacade';
import { setupServer } from '../../server';
import {
  deserializeError,
  FirstBonusMultiplier,
  GamePhase,
  Joker,
  LogLevel,
  serializeError,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';
import type { Server } from 'http';
import { AddressInfo } from 'net';
import { TestBackendApi, TestGameState } from '../utils/testApi';
import { exchangeCodeForToken, getDiscordUser } from '../../server/src/utils/discord';
import { LogCategory, logger } from '@yasq/server/src/utils/logger';
import { Player } from '../utils/helper';

const makeAuth = (id: string, username: string): AuthenticationResult =>
  ({
    access_token: `token_${id}`,
    user: {
      id,
      username,
    },
    scopes: ['identify'],
    expires: 'never',
  }) as AuthenticationResult;

const hostAuth = makeAuth('1', 'Host');
const playerAuth = makeAuth('2', 'Player');
const player2Auth = makeAuth('3', 'Player2');
const fakeAuth = makeAuth('fake', 'NonAuthenticatedPlayer');

const DEFAULT_PLAYERS: Player[] = [hostAuth.user, playerAuth.user];
const DEFAULT_SESSION: [Player[], TestGameState] = [DEFAULT_PLAYERS, { phase: GamePhase.SETUP }];

let currentInstanceId: string;
let httpServer: Server;
let hostFacade: BackendApiFacade;
let player1Facade: BackendApiFacade;
let player2Facade: BackendApiFacade;
let unknownFacade: BackendApiFacade;
let testBackend: TestBackendApi;
let loggerSpy: ReturnType<typeof vi.spyOn>;

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

      BackendApiFacade.BASE_URL = `http://localhost:${port}`;
      resolve();
    });
  });

  vi.mocked(exchangeCodeForToken).mockResolvedValue('mock_token_for_dev');
  vi.mocked(getDiscordUser).mockImplementation(async (accessToken: string) => {
    const id = accessToken.split('_')[1];
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

  testBackend = new TestBackendApi(currentInstanceId);

  hostFacade = new BackendApiFacade(currentInstanceId, hostAuth);
  player1Facade = new BackendApiFacade(currentInstanceId, playerAuth);
  player2Facade = new BackendApiFacade(currentInstanceId, player2Auth);
  unknownFacade = new BackendApiFacade(currentInstanceId, fakeAuth);

  // NOTE: Remove this mock implementation to see logs during integration tests (for debugging)
  loggerSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  loggerSpy.mockRestore();
});

describe('transferHostRole', () => {
  beforeEach(async () => {
    await testBackend.setupSession(...DEFAULT_SESSION);
  });

  afterEach(async () => {
    await testBackend.deleteSession();
  });

  it('should return 200 OK when host role is transferred by current host', async () => {
    const response = await hostFacade.transferHostRole(playerAuth.user.id);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('success');
  });

  it('should return 403 Forbidden when non-host player tries to transfer the host role', async () => {
    const response = await player1Facade.transferHostRole(playerAuth.user.id);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Only host can perform this action');
  });

  it('should return 400 Bad Request when host role is transferred to non-registered player', async () => {
    const response = await hostFacade.transferHostRole(fakeAuth.user.id);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('New host must be a registered user');
  });
});

describe('setupGame', () => {
  beforeEach(async () => {
    await testBackend.setupSession(...DEFAULT_SESSION);
  });

  afterEach(async () => {
    await testBackend.deleteSession();
  });

  it('should return 200 OK when valid settings are provided', async () => {
    const response = await hostFacade.setupGame({
      rounds: 5,
      maxGuessTime: 60,
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
    const response = await hostFacade.setupGame({
      rounds: 0,
      maxGuessTime: 60,
      enabledJokers: [],
      firstBonusMultiplier: FirstBonusMultiplier.OFF,
      timeBonus: TimeBonus.LINEAR,
      streakBonusMultiplier: StreakBonusMultiplier.OFF,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Property 'rounds' must be a positive integer (greater than 0)");
  });

  it('should return 400 Bad Request when guess time exceeds the maximum allowed value', async () => {
    const response = await hostFacade.setupGame({
      rounds: 5,
      maxGuessTime: 999999999,
      enabledJokers: [],
      firstBonusMultiplier: FirstBonusMultiplier.OFF,
      timeBonus: TimeBonus.LINEAR,
      streakBonusMultiplier: StreakBonusMultiplier.OFF,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Guess time must be between 1 and');
  });

  it('should return 403 Forbidden when non-host player tries to setup game', async () => {
    const response = await player1Facade.setupGame({
      rounds: 5,
      maxGuessTime: 60,
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
    await testBackend.setupSession(DEFAULT_PLAYERS, { phase: GamePhase.TRACK_SELECTION });
  });

  afterEach(async () => {
    await testBackend.deleteSession();
  });

  it('should return 200 OK when valid audio file is requested', async () => {
    const response = await hostFacade.playTrack('track001.mp3');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toContain('PLAYING');
  });

  it('should return 404 Not Found when non-existent audio file is requested', async () => {
    const response = await hostFacade.playTrack('bla.mp3');
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toContain('Track not found.');
  });

  it('should return 403 Forbidden when non-allowed audio file is requested', async () => {
    const response = await hostFacade.playTrack('track002.mp3');
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('You do not have permission to play this track.');
  });

  it('should return 403 Forbidden when non-host player tries to play track', async () => {
    const response = await player1Facade.playTrack('track002.mp3');
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Only host can perform this action');
  });
});

describe('submitGuess', () => {
  beforeEach(async () => {
    await testBackend.setupSession(DEFAULT_PLAYERS, { phase: GamePhase.PLAYING });
  });

  afterEach(async () => {
    await testBackend.deleteSession();
  });

  it('should return 200 OK when guess is submitted by registered player', async () => {
    const response = await player1Facade.submitGuess('guess', Date.now());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toContain('submitted');
  });

  it('should return 403 Forbidden when guess is submitted by non-registered player', async () => {
    const response = await unknownFacade.submitGuess('guess', Date.now());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain(`User ${fakeAuth.user.id} is not registered with this instance.`);
  });

  it('should return 400 Bad Request when submitted guess is too long', async () => {
    const response = await player1Facade.submitGuess(
      'thisisaverylongguessthatislongerthantheallowedcharacterlimitof100charactersandisthereforerejectedbytheserver',
      Date.now()
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Property 'guess' must be a string of 1 to 100 characters");
  });
});

describe('useJoker', () => {
  beforeEach(async () => {
    await testBackend.setupSession(
      [hostAuth.user, playerAuth.user, player2Auth.user],
      {
        phase: GamePhase.PLAYING,
      },
      {
        settings: {
          maxGuessTime: 60_000,
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
    await testBackend.deleteSession();
  });

  it('should return 200 OK when OBFUSCATION joker is used', async () => {
    await testBackend.patchEnabledJokers([Joker.OBFUSCATION]);

    const response = await player1Facade.useJoker(Joker.OBFUSCATION);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.OBFUSCATION);
    expect(body.hint.length).toEqual(6);
  });

  it('should return 200 OK when TRIVIA joker is used', async () => {
    await testBackend.patchEnabledJokers([Joker.TRIVIA]);

    const response = await player1Facade.useJoker(Joker.TRIVIA);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.TRIVIA);
    expect(body.hint).toStrictEqual([
      { type: 'platform', value: 'Platform A' },
      { type: 'release', value: '2026' },
    ]);
  });

  it('should return 200 OK when MULTIPLE_CHOICE joker is used', async () => {
    await testBackend.patchEnabledJokers([Joker.MULTIPLE_CHOICE]);

    const response = await player1Facade.useJoker(Joker.MULTIPLE_CHOICE);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.MULTIPLE_CHOICE);
    expect(body.hint).toContain('Game A');
  });

  it('should return 200 OK when GLIMPSE joker is used', async () => {
    await testBackend.patchEnabledJokers([Joker.GLIMPSE]);

    await hostFacade.playTrack('track001.mp3');

    const response = await player1Facade.useJoker(Joker.GLIMPSE);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.GLIMPSE);
    expect(body.hint).toBeDefined();
  });

  it('should return 400 Bad Request when SPY joker is missing targetId', async () => {
    await testBackend.patchEnabledJokers([Joker.SPY]);

    const response = await player1Facade.useJoker(Joker.SPY);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain('Spy joker requires additional property: targetId');
  });

  it('should return 202 Accepted when SPY joker target has not submitted', async () => {
    await testBackend.patchEnabledJokers([Joker.SPY]);

    const response = await player1Facade.useJoker(Joker.SPY, player2Auth.user.id);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.error).toContain("Target hasn't submitted yet.\nJoker not consumed.");
  });

  it('should return 200 OK when SPY joker is used with valid target', async () => {
    await testBackend.patchEnabledJokers([Joker.SPY]);

    await player2Facade.submitGuess('guess', Date.now());
    const response = await player1Facade.useJoker(Joker.SPY, player2Auth.user.id);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.jokerType).toBe(Joker.SPY);
    expect(body.hint).toEqual('guess');
  });

  it('should return 403 Forbidden when joker is not enabled', async () => {
    await testBackend.patchEnabledJokers([Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.SPY]);

    const response = await player1Facade.useJoker(Joker.OBFUSCATION);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain('Joker not enabled for this game');
  });

  it('should return 410 Gone when joker already used', async () => {
    await testBackend.patchEnabledJokers([Joker.OBFUSCATION]);

    await player1Facade.useJoker(Joker.OBFUSCATION);
    const response = await player1Facade.useJoker(Joker.OBFUSCATION);
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(body.error).toContain('Joker already used');
  });
});

describe('clientLogs', () => {
  beforeEach(async () => {
    await testBackend.setupSession(...DEFAULT_SESSION);
  });

  afterEach(async () => {
    await testBackend.deleteSession();
  });

  it("should forward a valid client log to the server's logger including the client's userId and instanceId", async () => {
    const response = await player1Facade.logToServer(LogLevel.INFO, 'Connection established');

    expect(response.status).toBe(200);
    expect(loggerSpy).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      LogLevel.INFO,
      'Connection established',
      LogCategory.CLIENT,
      expect.objectContaining({
        instanceId: currentInstanceId,
        clientUserId: playerAuth.user.id,
      })
    );
  });

  it('should correctly (de)serialize a given error and include it in the log context when provided', async () => {
    const message = 'Audio playback failed';

    const testErrorMessage = 'File not found';
    const testErrorObject = new Error(testErrorMessage);

    const testErrors = [
      [testErrorMessage, testErrorMessage],
      [testErrorObject, deserializeError(serializeError(testErrorObject))],
    ];

    for (const [errorInputValue, expectedReceivedValue] of testErrors) {
      const response = await player2Facade.logToServer(LogLevel.ERROR, message, errorInputValue);

      expect(response.status).toBe(200);
      expect(loggerSpy).toHaveBeenCalledWith(LogLevel.ERROR, message, LogCategory.CLIENT, {
        instanceId: currentInstanceId,
        clientUserId: player2Auth.user.id,
        error: expectedReceivedValue,
      });
    }
  });

  it('should return 400 Bad Request when log message is missing', async () => {
    const expectedStatusCode = 400;
    const expectedMessage = 'Missing property: message';

    const response = await player1Facade.logToServer(LogLevel.INFO, undefined);

    // Response includes the correct status code and error message
    expect(response.status).toBe(expectedStatusCode);
    const data = await response.json();
    expect(data.error).toBe(expectedMessage);

    // Additionally, a domain exception was logged on the server-side
    expect(loggerSpy).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      LogLevel.ERROR,
      'Domain exception',
      LogCategory.API,
      expect.objectContaining({
        error: expect.objectContaining({
          name: 'ApiError',
          message: expectedMessage,
          statusCode: expectedStatusCode,
        }),
      })
    );
  });

  it('should return 400 Bad Request when log level is invalid', async () => {
    const expectedStatusCode = 400;
    const invalidLogLevel = LogLevel.ERROR + 1;
    const expectedMessage = `Unknown log level ${invalidLogLevel}`;

    const response = await player1Facade.logToServer(invalidLogLevel as LogLevel, 'Test message');

    // Response includes the correct status code and error message
    expect(response.status).toBe(expectedStatusCode);
    const data = await response.json();
    expect(data.error).toBe(expectedMessage);

    // Additionally, a domain exception was logged on the server-side
    expect(loggerSpy).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      LogLevel.ERROR,
      'Domain exception',
      LogCategory.API,
      expect.objectContaining({
        error: expect.objectContaining({
          name: 'ApiError',
          message: expectedMessage,
          statusCode: expectedStatusCode,
        }),
      })
    );
  });
});
