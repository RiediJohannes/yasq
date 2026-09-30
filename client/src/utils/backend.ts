import {
  API_ROOT,
  BonusType,
  GameSettings,
  HOST_PREFIX,
  Joker,
  LogLevel,
  Participant,
  PointsBonus,
  serializeError,
  TimeBonus,
  TimeBonusSummary,
} from '@yasq/shared';
import { RoundResult } from './types';
import { AbstractDiscordSdk } from './connections';

// Note: Do NOT change the property names to camelCase! This needs to match the naming of discord's authentication response payload.
export interface AuthenticationResult {
  access_token: string;
  user: Participant;
  application: {
    id: string;
    name: string;
    description: string;
    icon?: string | null | undefined;
    rpc_origins?: string[] | undefined;
  };
  scopes: string[];
  expires: string;
}

export interface TimeBonusPlotPayload {
  participants: Participant[];
  timeBonusSummary: TimeBonusSummary | null;
}

export interface LogParams {
  instanceId?: string;
  error?: Error | string;
}

interface ApiRequestPayload extends Omit<RequestInit, 'body'> {
  token?: string;
  body?: object | undefined;
}

/**
 * A stateful abstraction layer, modelling all possible HTTP requests to the YASQ server component.
 */
export class Backend {
  /** The URL prefix (domain and path) that all backend requests are sent to. */
  public static BASE_URL = '';
  /** The ID of the current Discord activity for which our backend authentication is valid. */
  public readonly instanceId: string;
  private readonly auth: AuthenticationResult;
  private readonly sampleBonusCache = new Map<TimeBonus, TimeBonusPlotPayload>();

  public static async requestAccessToken(code: string): Promise<string> {
    const response = await fetch(`${Backend.BASE_URL}/${API_ROOT}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const { accessToken } = await response.json();
    return accessToken;
  }

  /**
   * Creates a stateful abstraction layer, modelling all possible HTTP requests to the YASQ server component.
   *
   * The creation of a new {@link Backend} instance requires a valid {@link AuthenticationResult}.<br/>
   * **Hint:** Use {@link Backend.requestAccessToken} with an authorized client code (obtainable through
   * {@link AbstractDiscordSdk.commands.authorize}) to retrieve a valid `accessToken`, which can in turn be used to
   * authenticate yourself with the Discord backend (see {@link AbstractDiscordSdk.commands.authenticate}).
   * The resulting {@link AuthenticationResult} is needed to create this {@link Backend} instance, as it will be used
   * to prove your identity yourself with the YASQ server for subsequent requests via method calls.
   * @param instanceId The ID of the current Discord Activity (see {@link AbstractDiscordSdk.instanceId}).
   * @param auth A valid {@link AuthenticationResult} payload obtained through {@link AbstractDiscordSdk.commands.authenticate}.
   */
  constructor(instanceId: string, auth: AuthenticationResult) {
    this.instanceId = instanceId;
    this.auth = auth;
  }

  public get accessToken(): string {
    return this.auth.access_token;
  }

  public get userId(): string {
    return this.auth.user.id;
  }

  public async updateReadyStatus(isReady: boolean) {
    return Backend.apiFetch(`/instance/${this.instanceId}/ready`, {
      method: 'PATCH',
      token: this.auth.access_token,
      body: { ready: isReady },
    });
  }

  public async updateReadyToPlayStatus(round: number, isReady: boolean, setupDurationMillis: number) {
    return Backend.apiFetch(`/instance/${this.instanceId}/round/${round}/ready`, {
      method: 'PATCH',
      token: this.auth.access_token,
      body: {
        ready: isReady,
        setupDuration: setupDurationMillis,
      },
    });
  }

  public async transferHostRole(newHostId: string) {
    return Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/transfer`, {
      method: 'PUT',
      token: this.auth.access_token,
      body: { newHostId },
    });
  }

  public async restartGame() {
    return Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/new`, {
      method: 'POST',
      token: this.auth.access_token,
    });
  }

  public async setupGame(settings: GameSettings<Joker[]>) {
    return Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/setup`, {
      method: 'POST',
      token: this.auth.access_token,
      body: {
        settings: {
          ...settings,
          enabledJokers: settings.enabledJokers ? [...settings.enabledJokers] : [],
        },
      },
    });
  }

  public async startGame() {
    return Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/start`, {
      method: 'POST',
      token: this.auth.access_token,
    });
  }

  public async getTrackList() {
    const response = await Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/tracks`, {
      token: this.auth.access_token,
    });
    return response.json();
  }

  public async submitGuess(guess: string, timestamp: number) {
    return Backend.apiFetch(`/instance/${this.instanceId}/guesses`, {
      method: 'POST',
      token: this.auth.access_token,
      body: {
        guess,
        clientTimestamp: timestamp,
      },
    });
  }

  public async getGuesses() {
    const response = await Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/guesses`, {
      token: this.auth.access_token,
    });
    return response.json();
  }

  public async getAvailableJokers() {
    const response = await Backend.apiFetch(`/instance/${this.instanceId}/available-jokers`, {
      token: this.auth.access_token,
    });
    return response.json();
  }

  public async useJoker(jokerType: Joker, targetId?: string) {
    return Backend.apiFetch(`/instance/${this.instanceId}/jokers`, {
      method: 'PATCH',
      token: this.auth.access_token,
      body: { jokerType, targetId },
    });
  }

  public async playTrack(fileName: string) {
    return Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/tracks/play`, {
      method: 'POST',
      token: this.auth.access_token,
      body: { fileName },
    });
  }

  public async getCurrentTrack() {
    const response = await Backend.apiFetch(`/instance/${this.instanceId}/current-track`, {
      token: this.auth.access_token,
    });
    return response.json();
  }

  public async submitRoundResults(corrections: Record<string, number>) {
    return Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/round-results`, {
      method: 'POST',
      token: this.auth.access_token,
      body: { corrections },
    });
  }

  public async getRoundResults() {
    const response = await Backend.apiFetch(`/instance/${this.instanceId}/round-results?user_id=${this.userId}`);

    if (!response.ok) {
      const errorData = await response.json();
      const error = new Error(errorData.error || 'Request failed');
      (error as any).status = response.status;
      throw error;
    }

    const roundData = await response.json();

    roundData.result = roundData.result.map((roundResult: RoundResult) => {
      roundResult.awardedBonuses =
        roundResult.awardedBonuses?.map(
          (bonus: { type: BonusType; multiplier: number }) => new PointsBonus(bonus.type, bonus.multiplier)
        ) ?? [];

      return roundResult;
    });

    return roundData;
  }

  public async getSampleTimeBonusSummary(bonusType: TimeBonus): Promise<TimeBonusPlotPayload> {
    if (this.sampleBonusCache.has(bonusType)) {
      return this.sampleBonusCache.get(bonusType)!;
    }

    const response = await Backend.apiFetch(`/samples/time-bonus/${bonusType}/summary`);

    if (!response.ok) {
      const errorData = await response.json();
      const error = new Error(errorData.error || 'Request failed');
      (error as any).status = response.status;
      throw error;
    }

    const payload: TimeBonusPlotPayload = await response.json();
    this.sampleBonusCache.set(bonusType, payload);

    return payload;
  }

  public async startNextRound() {
    return Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/rounds/next`, {
      method: 'POST',
      token: this.auth.access_token,
    });
  }

  public async getFinalResults() {
    const response = await Backend.apiFetch(`/instance/${this.instanceId}/final-results`);
    return response.json();
  }

  public async downloadResultsImage(discordSdk: AbstractDiscordSdk) {
    const base = typeof window !== 'undefined' ? window.location.origin : Backend.BASE_URL;
    const targetUrl = `${base}/${API_ROOT}/instance/${this.instanceId}/final-results?download`;

    discordSdk.commands
      .openExternalLink({ url: targetUrl })
      .catch((err: any) => console.warn('Discord SDK prompt breakout error:', err));
  }

  public async postResultsToDiscordChannel(channelId: string) {
    return Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/results/send`, {
      method: 'POST',
      token: this.auth.access_token,
      body: { channelId },
    });
  }

  public async getDiscordChannels(guildId: string) {
    const response = await Backend.apiFetch(`/${HOST_PREFIX}/instance/${this.instanceId}/guild/${guildId}/channels`, {
      token: this.auth.access_token,
    });
    return response.json();
  }

  public async logToServer(level: LogLevel, message: string, error?: Error | string) {
    const serializedError = error instanceof Error ? serializeError(error) : error;

    return Backend.apiFetch('log', {
      method: 'POST',
      body: {
        level,
        message,
        userId: this.userId,
        instanceId: this.instanceId,
        error: serializedError,
      },
    });
  }

  /**
   * This *static* method enables clients to send log messages to the YASQ server even before they have completed the necessary
   * authentication steps to create a {@link Backend} instance.<br/>
   * **Note:** Once you are in possession of an instantiated {@link Backend}, prefer the instance method {@link logToServer},
   * as this will automatically attach **user and activity metadata** to the request.
   */
  public static async logToServerAnonymously(level: LogLevel, message: string, context: LogParams = {}) {
    const serializedError = context.error instanceof Error ? serializeError(context.error) : context.error;

    return Backend.apiFetch('log', {
      method: 'POST',
      body: {
        level,
        message,
        instanceId: context.instanceId,
        error: serializedError,
      },
    });
  }

  /**
   * Simple helper function to reduce boilerplate around sending HTTP API requests by automatically packaging the body
   * as a JSON payload and adding the respective Authorization header when an auth token is passed.
   *
   * The HTTP request is sent to the server at {@link Backend.BASE_URL} using the {@link API_ROOT} plus the given `path` as the
   * target endpoint.
   */
  private static async apiFetch(path: string, payload: ApiRequestPayload = {}): Promise<Response> {
    const { token, body, headers, ...customConfig } = payload;

    const requestHeaders: Record<string, string> = {
      ...(headers as Record<string, string>),
    };

    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    let requestBody: BodyInit | undefined;
    if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
      requestBody = JSON.stringify(body);
    }

    const trimmedPath = path.startsWith('/') ? path.slice(1).trim() : path.trim();
    const url = `${Backend.BASE_URL}/${API_ROOT}/${trimmedPath}`;

    return fetch(url, {
      ...customConfig,
      headers: requestHeaders,
      body: requestBody,
    });
  }
}
