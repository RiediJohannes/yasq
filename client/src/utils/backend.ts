import {
  API_ROOT,
  BonusType,
  GameSettings,
  HOST_PREFIX,
  Joker,
  Participant,
  PointsBonus,
  TimeBonus,
  TimeBonusSummary,
} from '@yasq/shared';
import { RoundResult } from './types';
import { LogLevel } from 'vite';

let baseUrl = '';

export function setBaseUrl(url: string) {
  baseUrl = url;
}

interface ApiRequestPayload extends Omit<RequestInit, 'body'> {
  token?: string;
  body?: object | undefined;
}

/**
 * Simple helper function to reduce boilerplate around sending HTTP API requests by automatically packaging the body
 * as a JSON payload and adding the respective Authorization header when an auth token is passed.
 *
 * The HTTP request is sent to the server at {@link baseUrl} using the {@link API_ROOT} plus the given `path` as the
 * target endpoint.
 */
async function apiFetch(path: string, payload: ApiRequestPayload = {}): Promise<Response> {
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
  const url = `${baseUrl}/${API_ROOT}/${trimmedPath}`;

  return fetch(url, {
    ...customConfig,
    headers: requestHeaders,
    body: requestBody,
  });
}

export async function requestAuthToken(code: string) {
  const response = await apiFetch(`/auth/token`, {
    method: 'POST',
    body: { code },
  });
  return response.json();
}

export async function updateReadyStatus(access_token: string, instanceId: string, isReady: boolean) {
  return apiFetch(`/instance/${instanceId}/ready`, {
    method: 'PATCH',
    token: access_token,
    body: { ready: isReady },
  });
}

export async function transferHostRole(access_token: string, instanceId: string, newHostId: string) {
  return apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/transfer`, {
    method: 'PUT',
    token: access_token,
    body: { newHostId },
  });
}

export async function restartGame(access_token: string, instanceId: string) {
  return apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/new`, {
    method: 'POST',
    token: access_token,
  });
}

export async function setupGame(access_token: string, instanceId: string, settings: GameSettings<Joker[]>) {
  return apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/setup`, {
    method: 'POST',
    token: access_token,
    body: {
      settings: {
        ...settings,
        enabledJokers: settings.enabledJokers ? [...settings.enabledJokers] : [],
      },
    },
  });
}

export async function startGame(access_token: string, instanceId: string) {
  return apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/start`, {
    method: 'POST',
    token: access_token,
  });
}

export async function getTrackList(access_token: string, instanceId: string) {
  const response = await apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/tracks`, {
    token: access_token,
  });
  return response.json();
}

export async function submitGuess(access_token: string, instanceId: string, guess: string) {
  return apiFetch(`/instance/${instanceId}/guesses`, {
    method: 'POST',
    token: access_token,
    body: {
      guess,
      clientTimestamp: Date.now(),
    },
  });
}

export async function getGuesses(access_token: string, instanceId: string) {
  const response = await apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/guesses`, {
    token: access_token,
  });
  return response.json();
}

export async function getAvailableJokers(access_token: string, instanceId: string) {
  const response = await apiFetch(`/instance/${instanceId}/available-jokers`, {
    token: access_token,
  });
  return response.json();
}

export async function useJoker(access_token: string, instanceId: string, jokerType: Joker, targetId?: string) {
  return apiFetch(`/instance/${instanceId}/jokers`, {
    method: 'PATCH',
    token: access_token,
    body: { jokerType, targetId },
  });
}

export async function playTrack(access_token: string, fileName: string, instanceId: string) {
  return apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/tracks/play`, {
    method: 'POST',
    token: access_token,
    body: { fileName },
  });
}

export async function getCurrentTrack(access_token: string, instanceId: string) {
  const response = await apiFetch(`/instance/${instanceId}/current-track`, {
    token: access_token,
  });
  return response.json();
}

export async function submitRoundResults(
  access_token: string,
  instanceId: string,
  corrections: Record<string, number>
) {
  return apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/round-results`, {
    method: 'POST',
    token: access_token,
    body: { corrections },
  });
}

export async function getRoundResults(instanceId: string, userId: string) {
  const response = await apiFetch(`/instance/${instanceId}/round-results?user_id=${userId}`);

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

export interface TimeBonusPlotPayload {
  participants: Participant[];
  timeBonusSummary: TimeBonusSummary | null;
}

const sampleBonusCache = new Map<TimeBonus, TimeBonusPlotPayload>();

export async function getSampleTimeBonusSummary(bonusType: TimeBonus): Promise<TimeBonusPlotPayload> {
  if (sampleBonusCache.has(bonusType)) {
    return sampleBonusCache.get(bonusType)!;
  }

  const response = await apiFetch(`//samples/time-bonus/${bonusType}/summary`);

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.error || 'Request failed');
    (error as any).status = response.status;
    throw error;
  }

  const payload: TimeBonusPlotPayload = await response.json();
  sampleBonusCache.set(bonusType, payload);

  return payload;
}

export async function startNextRound(access_token: string, instanceId: string) {
  return apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/rounds/next`, {
    method: 'POST',
    token: access_token,
  });
}

export async function getFinalResults(instanceId: string) {
  const response = await apiFetch(`/instance/${instanceId}/final-results`);
  return response.json();
}

export async function downloadResultsImage(instanceId: string, discordSdk: any) {
  const base = typeof window !== 'undefined' ? window.location.origin : baseUrl;
  const targetUrl = `${base}/${API_ROOT}/instance/${instanceId}/final-results?download`;

  discordSdk.commands
    .openExternalLink({ headers: { 'Content-Disposition': 'attachment' }, url: targetUrl })
    .catch((err: any) => console.warn('Discord SDK prompt breakout error:', err));
}

export async function postResultsToDiscordChannel(access_token: string, instanceId: string, channelId: string) {
  return apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/results/send`, {
    method: 'POST',
    token: access_token,
    body: { channelId },
  });
}

export async function getDiscordChannels(access_token: string, instanceId: string, guildId: string) {
  const response = await apiFetch(`/${HOST_PREFIX}/instance/${instanceId}/guild/${guildId}/channels`, {
    token: access_token,
  });
  return response.json();
}

export async function logToServer(level: LogLevel, message: string, username: string) {
  return apiFetch(`/log`, {
    method: 'POST',
    body: {
      level,
      message,
      user: username,
    },
  });
}
