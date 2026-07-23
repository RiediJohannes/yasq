import { BonusType, GameSettings, Joker, Participant, PointsBonus, TimeBonus, TimeBonusSummary } from "@yasq/shared";
import { RoundResult } from "./types";

let baseUrl = '';

export function setBaseUrl(url: string) {
  baseUrl = url;
}

export async function getToken(code: string) {
  const response = await fetch(`${baseUrl}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return response.json();
}

export async function updateReadyStatus(access_token: string, instanceId: string, isReady: boolean) {
  return fetch(`${baseUrl}/api/ready`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      'Authorization': `Bearer ${access_token}`
    },
    body: JSON.stringify({ instanceId, ready: isReady }),
  });
}

export async function assignNewHost(access_token: string, instanceId: string, newHostId: string) {
  return fetch(`${baseUrl}/api/assign-host`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      'Authorization': `Bearer ${access_token}`
    },
    body: JSON.stringify({ instanceId, newHostId }),
  });
}

export async function setupGame(access_token: string, instanceId: string, settings: GameSettings) {
  return fetch(`${baseUrl}/api/setup-game`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access_token}`
    },
    body: JSON.stringify({
      instanceId,
      settings: {
        ...settings,
        enabledJokers: settings.enabledJokers ? [...settings.enabledJokers] : []
      }
    }),
  });
}

export async function startGame(access_token: string, instanceId: string) {
  return fetch(`${baseUrl}/api/start-game`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access_token}`
    },
    body: JSON.stringify({ instanceId }),
  });
}

export async function getTrackList(access_token: string, instanceId: string) {
  const response = await fetch(`${baseUrl}/api/track-list?instanceId=${instanceId}`, {
    headers: {
      "Authorization": `Bearer ${access_token}`
    },
  });
  return response.json();
}

export async function submitGuess(access_token: string, instanceId: string, guess: string) {
  return fetch(`${baseUrl}/api/submit-guess`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access_token}`
    },
    body: JSON.stringify({
      instanceId,
      guess,
      clientTimestamp: Date.now()
    }),
  });
}

export async function getGuesses(access_token: string, instanceId: string) {
  const response = await fetch(`${baseUrl}/api/get-guesses?instanceId=${instanceId}`, {
    headers: {
      "Authorization": `Bearer ${access_token}`
    },
  });
  return response.json();
}

export async function submitRoundResults(access_token: string, instanceId: string, corrections: Record<string, number>) {
  return fetch(`${baseUrl}/api/submit-round-results`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access_token}`
    },
    body: JSON.stringify({ instanceId, corrections }),
  });
}

export async function getRoundResults(instanceId: string, userId: string) {
  const response = await fetch(`${baseUrl}/api/get-results?instanceId=${instanceId}&userId=${userId}`);

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.error || 'Request failed');
    (error as any).status = response.status;
    throw error;
  }

  let roundData = await response.json();

  roundData.result = roundData.result.map((roundResult: RoundResult) => {
    roundResult.awardedBonuses = roundResult.awardedBonuses?.map((bonus: { type: BonusType; multiplier: number }) =>
      new PointsBonus(bonus.type, bonus.multiplier)
    ) ?? [];

    return roundResult;
  })

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

  const response = await fetch(`/api/get-sample-time-bonus-summary?type=${bonusType}`);

  if (!response.ok) {
    const errorData = await response.json();
    const error = new Error(errorData.error || 'Request failed');
    (error as any).status = response.status;
    throw error;
  }

  const payload: TimeBonusPlotPayload = await response.json();
  sampleBonusCache.set(bonusType, payload);  // cache responses because they always yield the same data

  return payload;
}

export async function startNextRound(access_token: string, instanceId: string) {
  return fetch(`${baseUrl}/api/start-next-round`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access_token}`
    },
    body: JSON.stringify({ instanceId })
  });
}

export async function getFinalResults(instanceId: string) {
  const response = await fetch(`${baseUrl}/api/get-final-results?instanceId=${instanceId}`);
  return response.json();
}

export async function restartGame(access_token: string, instanceId: string) {
  return fetch(`${baseUrl}/api/restart-game`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access_token}`
    },
    body: JSON.stringify({ instanceId })
  });
}

export async function getAvailableJokers(access_token: string, instanceId: string) {
  const response = await fetch(`${baseUrl}/api/get-available-jokers?instanceId=${instanceId}`, {
    headers: {
      "Authorization": `Bearer ${access_token}`
    },
  });
  return response.json();
}

export async function useJoker(access_token: string, instanceId: string, jokerType: Joker, targetId?: string) {
  return await fetch(`${baseUrl}/api/use-joker`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access_token}`
    },
    body: JSON.stringify({ instanceId, jokerType, targetId }),
  });
}

export async function playTrack(access_token: string, fileName: string, instanceId: string) {
  return fetch(`${baseUrl}/api/play-local`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access_token}`
    },
    body: JSON.stringify({ fileName, instanceId })
  });
}

export async function getCurrentTrack(access_token: string, instanceId: string) {
    const response = await fetch(`${baseUrl}/api/current-track?instanceId=${instanceId}`, {
      headers: {
        "Authorization": `Bearer ${access_token}`
      },
    });
    return response.json();
}

export async function logToServer(message: string, username: string) {
  return fetch(`${baseUrl}/api/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, user: username }),
  });
}

export async function downloadResultsImage(instanceId: string, discordSdk: any) {
  const base = typeof window !== 'undefined' ? window.location.origin : baseUrl;
  const targetUrl = `${base}/api/download-results?instanceId=${instanceId}`;

  discordSdk.commands.openExternalLink({ url: targetUrl })
    .catch((err: any) => console.warn("Discord SDK prompt breakout error:", err));
}

export async function postResultsToDiscordChannel(access_token: string, instanceId: string, channelId: string) {
  return fetch(`${baseUrl}/api/post-results-to-channel`, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${access_token}`
    },
    body: JSON.stringify({ instanceId, channelId }),
  });
}

export async function getChannels(access_token: string, instanceId: string, guildId: string) {
  const response = await fetch(`${baseUrl}/api/get-channels?instanceId=${instanceId}&guildId=${guildId}`, {
    headers: {
      "Authorization": `Bearer ${access_token}`
    },
  });
  return response.json();
}