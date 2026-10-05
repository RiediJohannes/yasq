import { signal } from '@preact/signals';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { mockDiscordSdk } from '@mock/mockDiscordSdk';
import { DEFAULT_VOLUME_SLIDER_VAL, GamePhase, GameSettings, GameStatus, MAX_VOLUME, Participant } from '@yasq/shared';
import type { AuthenticationResult, BackendApiFacade } from './backend/apiFacade';

export type AbstractDiscordSdk = DiscordSDK | typeof mockDiscordSdk;

export interface ApiCache {
  instanceId: string;
  authResult: AuthenticationResult;
}

declare global {
  interface Window {
    __DISCORD_SDK__?: AbstractDiscordSdk;
    __API_CACHE__?: ApiCache;
  }
}

export function getDiscordSdk(): AbstractDiscordSdk {
  const isMockMode = import.meta.env.VITE_MOCK_MODE === 'true';
  let discordSdk: AbstractDiscordSdk;

  if (isMockMode) {
    console.log('[SDK] Using mocked Discord SDK');
    discordSdk = mockDiscordSdk; // mock the discord SDK
  } else if (window.__DISCORD_SDK__) {
    // Do not instantiate a new SDK if only the webpage got reloaded
    console.log('[SDK] Restoring existing Discord SDK instance from window');
    discordSdk = window.__DISCORD_SDK__;
  } else {
    console.log('[SDK] Instantiating a new Discord SDK instance');
    discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
    window.__DISCORD_SDK__ = discordSdk;
  }

  return discordSdk;
}

export const discordSdk: AbstractDiscordSdk = getDiscordSdk();
export const backend = signal<BackendApiFacade | null>(null);
export const participants = signal<Participant[]>([]);

export const BackendContext = createContext<BackendApiFacade>(null!);
export const useBackend = (): BackendApiFacade => useContext(BackendContext);

export const gameStatus = signal<GameStatus>({
  state: {
    game: 1,
    round: 0,
    phase: GamePhase.LOBBY,
    playback: null,
  },
  hostId: null,
  readyPlayers: [],
  guessedPlayers: [],
  lastWinnerId: null,
  settings: GameSettings.withJokerArray(),
  streaks: {},
  lostStreaks: {},
});

export const volume = signal(DEFAULT_VOLUME_SLIDER_VAL);

export const audioPlayer = new Audio();
audioPlayer.loop = true;
const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
const source = audioContext.createMediaElementSource(audioPlayer);

export const gainNode = audioContext.createGain();
source.connect(gainNode);
gainNode.connect(audioContext.destination);
gainNode.gain.value = DEFAULT_VOLUME_SLIDER_VAL * MAX_VOLUME;

export const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
