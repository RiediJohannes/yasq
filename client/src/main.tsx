import { render } from 'preact';
import { signal } from '@preact/signals';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { io, Socket } from 'socket.io-client';

import * as backend from './utils/backend';
import { getUserId, withTimeout } from './utils/helper';
import { GameStatus } from './utils/types';
import {
  DEFAULT_VOLUME_SLIDER_VAL,
  GameSettings,
  GameState,
  MAX_VOLUME,
  Participant,
  WS_GAME_STATUS_UPDATE_EVENT,
  WS_JOIN_INSTANCE_EVENT,
} from '@yasq/shared';
import { mockDiscordSdk } from '../../mock_data/mockDiscordSdk';

import { GameHeader } from './components/GameHeader';
import { Sidebar } from './components/Sidebar';

import { SetupView } from './views/SetupView';
import { LobbyView } from './views/LobbyView';
import { TrackSelectionView } from './views/TrackSelectionView';
import { PlayingView } from './views/PlayingView';
import { HostReviewView } from './views/HostReviewView';
import { RoundResultsView } from './views/RoundResultsView';
import { FinalResultsView } from './views/FinalResultsView';

import './style.css';
import { probeDiscordIPC, socketConnected, socketSignal, trackSocketConnection } from './utils/reconnector';
import { DisconnectBanner } from './components/DisconnectBanner';

const isMockMode = import.meta.env.VITE_MOCK_MODE === 'true';

// 🛠️ HMR SURVIVAL: Prevent Vite from instantiating multiple SDKs and sending duplicate handshakes
export let discordSdk: DiscordSDK | typeof mockDiscordSdk;
if (isMockMode) {
  discordSdk = mockDiscordSdk;
} else if ((window as any).__DISCORD_SDK__) {
  // If Vite HMR re-evaluates this file, use the existing SDK bridge!
  console.log('[DEV] Restoring existing DiscordSDK instance from window...');
  discordSdk = (window as any).__DISCORD_SDK__;
} else {
  // First time boot
  discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
  (window as any).__DISCORD_SDK__ = discordSdk;
}

export const auth = signal<any | null>(null);
export const gameState = signal<GameStatus>({
  state: GameState.LOBBY,
  hostId: null,
  readyUsers: [],
  guessedPlayers: [],
  currentRound: 0,
  lastWinnerId: null,
  gameSettings: GameSettings.withJokerArray(),
  streaks: {},
  lostStreaks: {},
});
export const participants = signal<Participant[]>([]);
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
export let socket: Socket;

export const isInitializing = signal<boolean>(true);
export const initError = signal<string | null>(null);

const App = () => {
  if (!auth.value)
    return (
      <>
        <DisconnectBanner />
        <div
          className="centered"
          style={{ textAlign: 'center' }}
        >
          {initError.value ? (
            <div>
              <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>Connection Failed</p>
              <small style={{ color: '#ff6b6b' }}>{initError.value}</small>
            </div>
          ) : (
            'Authenticating...'
          )}
        </div>
      </>
    );

  if (gameState.value.hostId === null) {
    return (
      <>
        <DisconnectBanner />
        <div className="centered">Starting Game...</div>
      </>
    );
  }

  const isHost = String(getUserId(auth.value)) === String(gameState.value.hostId);

  return (
    <>
      <div className="container">
        <div className="game-column">
          <GameHeader />
          <DisconnectBanner />
          <main
            className="game-area"
            key={`view-${isHost}-${gameState.value.state}`}
          >
            {renderView(isHost)}
          </main>
        </div>
        <Sidebar />
      </div>
      <footer>
        <p className="version">Ver. {import.meta.env.VERSION}</p>
      </footer>
    </>
  );
};

const renderView = (isHost: boolean) => {
  switch (gameState.value.state) {
    case GameState.SETUP:
      return <SetupView isHost={isHost} />;
    case GameState.LOBBY:
      return <LobbyView isHost={isHost} />;
    case GameState.TRACK_SELECTION:
      return <TrackSelectionView isHost={isHost} />;
    case GameState.PLAYING:
      return <PlayingView isHost={isHost} />;
    case GameState.HOST_REVIEW:
      return <HostReviewView isHost={isHost} />;
    case GameState.ROUND_RESULTS:
      return <RoundResultsView isHost={isHost} />;
    case GameState.FINAL_RESULTS:
      return <FinalResultsView isHost={isHost} />;
  }
};

render(<App />, document.getElementById('app')!);

export const initializeAppFlow = async (isReconnect = false) => {
  isInitializing.value = true;
  initError.value = null;
  console.log(`\n=== STARTING FLOW (Reconnect: ${isReconnect}) ===`);

  try {
    // 1. Attempt to recover the FULL auth payload from memory
    const cachedAuth = (window as any).__DISCORD_AUTH__;

    // if (!cachedAuth) {
    //   const sessionAuthStr = sessionStorage.getItem('discord_auth_payload');
    //   if (sessionAuthStr) {
    //     cachedAuth = JSON.parse(sessionAuthStr);
    //   }
    // }

    if (cachedAuth) {
      console.log('[FLOW] Using cached auth payload from window/session. Bypassing SDK Auth.');

      // Restore the full auth object
      auth.value = cachedAuth;
    } else {
      console.log('[FLOW] No token found in memory. Starting full Discord SDK handshake...');

      await withTimeout(discordSdk.ready(), 10000, 'Discord SDK ready timeout');

      const { code } = await withTimeout<any>(
        discordSdk.commands.authorize({
          client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify', 'guilds', 'applications.commands'],
        }),
        10000,
        'Authorize timed out'
      );

      const { access_token } = await backend.getToken(code);

      // Fetch the full payload from Discord
      const authResult = await withTimeout<any>(
        discordSdk.commands.authenticate({ access_token }),
        10000,
        'Authenticate timed out'
      );

      // 🛠️ HMR SURVIVAL: Save the entire payload (JSON for storage, object for memory)
      // sessionStorage.setItem('discord_auth_payload', JSON.stringify(authResult));
      (window as any).__DISCORD_AUTH__ = authResult;

      auth.value = authResult;

      console.log('[FLOW] Authentication complete. Token cached.');
    }

    // Now we extract the token safely for the Socket logic
    const currentToken = auth.value.access_token;
    const isIpcAlive = isReconnect ? await probeDiscordIPC() : true;

    // STEP 2: WEBSOCKET RECOVERY
    console.log('[FLOW] Establishing WebSocket...');
    if (socketSignal.value) {
      socketSignal.value.disconnect();
    }
    const socket = io({ auth: { token: currentToken } });
    socketSignal.value = socket;
    trackSocketConnection(socketSignal.value);

    socket.on('connect', () => {
      console.log('[FLOW] Socket connected! Emitting WS_JOIN_INSTANCE_EVENT');
      socket.emit(WS_JOIN_INSTANCE_EVENT, { instanceId: discordSdk.instanceId });
    });
    socket.io.on('reconnect', attempt => {
      console.log(`[FLOW] Socket reconnected successfully on attempt ${attempt}...`);
      socket.emit(WS_JOIN_INSTANCE_EVENT, { instanceId: discordSdk.instanceId });
    });
    socket.on('disconnect', reason => {
      console.warn(`[DIAGNOSTICS] Socket disconnected. Reason: ${reason}`);
    });

    socket.on(WS_GAME_STATUS_UPDATE_EVENT, updatedState => {
      console.log('[FLOW] Received WS_GAME_STATUS_UPDATE_EVENT from backend.');
      gameState.value = updatedState;
      // DIAGNOSTIC: Check if backend is sending participants
      if (updatedState.participants) {
        console.log('[DIAGNOSTICS] Backend provided participant list!');
        participants.value = updatedState.participants;
      }
    });

    window.addEventListener('offline', () => {
      console.warn('[NETWORK] Browser went offline.');
      socketConnected.value = false;
    });
    window.addEventListener('online', () => {
      console.log('[NETWORK] Browser back online. Triggering reconnect...');
      // Trigger manual reconnect if socket hasn't reconnected automatically
      if (socketSignal.value && !socketSignal.value.connected) {
        socketSignal.value.connect();
      }
    });

    // STEP 3: PARTICIPANT SYNC
    if (isIpcAlive) {
      console.log('[FLOW] Syncing participants via Discord SDK...');
      const participantData = await discordSdk.commands.getInstanceConnectedParticipants();
      participants.value = participantData.participants;
      discordSdk.subscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', (e: any) => (participants.value = e.participants));
    } else {
      console.warn('[FLOW] IPC dead. Relying entirely on backend for participant sync.');
    }
  } catch (error: any) {
    console.error('[FLOW] Initialization / Reconnection Failed:', error);
    initError.value = error.message || 'An unknown error occurred.';
  } finally {
    isInitializing.value = false;
    console.log('=== FLOW COMPLETE ===\n');
  }
};

// Initial boot
void initializeAppFlow();
