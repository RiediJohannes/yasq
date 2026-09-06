import { DiscordSDK } from '@discord/embedded-app-sdk';
import { mockDiscordSdk } from '../../../mock_data/mockDiscordSdk';
import { withTimeout } from './helper';
import * as backend from './backend';
import { gameState, participants } from '../main';
import { io, Socket } from 'socket.io-client';
import { Participant, WS_GAME_STATUS_UPDATE_EVENT, WS_JOIN_INSTANCE_EVENT } from '@yasq/shared';
import { Signal, signal } from '@preact/signals';

const CONNECTION_TIMEOUT_MILLIS_LONG: number = 10_000;
const CONNECTION_TIMEOUT_MILLIS_SHORT: number = 3000;

const socketSignal = signal<Socket | null>(null);
export const socketConnected = signal<boolean>(false);

export type AbstractDiscordSdk = DiscordSDK | typeof mockDiscordSdk;

export function getDiscordSdk(): AbstractDiscordSdk {
  const isMockMode = import.meta.env.VITE_MOCK_MODE === 'true';
  let discordSdk: AbstractDiscordSdk;

  if (isMockMode) {
    console.log('[SDK] Using mocked Discord SDK');
    discordSdk = mockDiscordSdk; // mock the discord SDK
  } else if ((window as any).__DISCORD_SDK__) {
    // Do not instantiate a new SDK if only the webpage got reloaded
    console.log('[SDK] Restoring existing Discord SDK instance from window');
    discordSdk = (window as any).__DISCORD_SDK__;
  } else {
    console.log('[SDK] Instantiating a new Discord SDK instance');
    discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
    (window as any).__DISCORD_SDK__ = discordSdk;
  }

  return discordSdk;
}

export interface AuthenticationResult {
  access_token: string;
  user: Participant;
  application: {
    id: string;
    name: string;
    description: string;
    icon: string;
  };
  scopes: string[];
  expires: string;
}

export async function authenticateWithDiscord(discordSdk: AbstractDiscordSdk): Promise<AuthenticationResult> {
  const cachedAuth = (window as any).__DISCORD_AUTH__;

  if (cachedAuth) {
    console.log('[INIT] Using cached auth payload - bypassing SDK authentication.');
    return cachedAuth;
  }

  console.log('[INIT] Starting full Discord activity handshake...');
  await withTimeout(discordSdk.ready(), CONNECTION_TIMEOUT_MILLIS_LONG, 'discordSdk.ready() reached timeout');

  const { code } = await withTimeout<any>(
    discordSdk.commands.authorize({
      client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'guilds', 'applications.commands'],
    }),
    CONNECTION_TIMEOUT_MILLIS_LONG,
    'Discord Authorization reached timeout'
  );

  const { access_token } = await backend.getToken(code);

  const authResult = await withTimeout<any>(
    discordSdk.commands.authenticate({ access_token }),
    CONNECTION_TIMEOUT_MILLIS_LONG,
    'Discord User Authentication reached timeout'
  );

  // Cache auth result in the current iframe
  (window as any).__DISCORD_AUTH__ = authResult;

  console.log('[INIT] Authentication complete. Connected to Discord backend.');
  return authResult;
}

export function establishServerConnection(instanceId: string, authToken: string) {
  console.log('[INIT] Establishing WebSocket...');
  if (socketSignal.value) {
    socketSignal.value.disconnect();
  }

  const socket = io({ auth: { token: authToken } });
  socketSignal.value = socket;
  trackConnectionStatus(socketSignal.value);

  socket.on('connect', () => {
    console.log('[DIAGNOSTICS] Socket connected! Emitting WS_JOIN_INSTANCE_EVENT');
    socket.emit(WS_JOIN_INSTANCE_EVENT, { instanceId });
  });
  socket.io.on('reconnect', attempt => {
    console.log(`[DIAGNOSTICS] Socket reconnected successfully on attempt ${attempt}...`);
    socket.emit(WS_JOIN_INSTANCE_EVENT, { instanceId });
  });
  socket.on('disconnect', reason => {
    console.warn(`[DIAGNOSTICS] Socket disconnected. Reason: ${reason}`);
  });

  socket.on(WS_GAME_STATUS_UPDATE_EVENT, updatedState => {
    gameState.value = updatedState;
    if (updatedState.participants) {
      participants.value = updatedState.participants;
    }
  });

  window.addEventListener('offline', () => {
    console.warn('[NETWORK] Browser went offline.');
    socketConnected.value = false;
  });
  window.addEventListener('online', () => {
    console.log('[NETWORK] Browser is back online. Triggering reconnect...');
    // Check socket connection status and trigger reconnection if necessary
    if (socketSignal.value && !socketSignal.value.connected) {
      socketSignal.value.connect();
    }
  });
}

const trackConnectionStatus = (socket: Socket) => {
  socketConnected.value = socket.connected;

  socket.on('connect', () => (socketConnected.value = true));
  socket.on('disconnect', () => (socketConnected.value = false));
  socket.on('connect_error', () => (socketConnected.value = false));

  socket.io.on('reconnect', _attempt => (socketConnected.value = true));
  socket.io.on('reconnect_attempt', _attempt => (socketConnected.value = false));
  socket.io.on('reconnect_failed', () => (socketConnected.value = false));
};

interface ParticipantsPayload {
  participants: Participant[];
}

export async function syncParticipants(
  discordSdk: AbstractDiscordSdk,
  participantsSignal: Signal<Participant[]>
): Promise<void> {
  console.log('[INIT] Syncing participants via Discord backend');
  const participantData = await withTimeout<ParticipantsPayload>(
    discordSdk.commands.getInstanceConnectedParticipants(),
    CONNECTION_TIMEOUT_MILLIS_SHORT,
    'Requesting instance participants reached timeout'
  );

  participantsSignal.value = participantData.participants;
  discordSdk.subscribe(
    'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
    (e: ParticipantsPayload) => (participantsSignal.value = e.participants)
  );
}

/**
 * Subscribes a handler to the given game event and returns an unsubscribe function for clean-up.
 */
export function onGameEvent<T = any>(event: string, callback: (data: T) => void): () => void {
  const socket = socketSignal.value;
  if (!socket) return () => {};

  socket.on(event, callback);

  return () => {
    socketSignal.value?.off(event, callback);
  };
}
