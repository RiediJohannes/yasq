import { Events } from '@discord/embedded-app-sdk';
import { Signal, signal } from '@preact/signals';
import { io, Socket } from 'socket.io-client';

import { GameEvent, Participant, TGameEvent } from '@yasq/shared';
import { AbstractDiscordSdk, ApiCache, gameStatus, participants } from '@yasq/client/src/globals';
import { withTimeout } from '../utils/helper';
import { AuthenticationResult, BackendApiFacade } from './apiFacade';
import { syncClockWithServer } from './timing';

const CONNECTION_TIMEOUT_MILLIS_LONG: number = 10_000;
const CONNECTION_TIMEOUT_MILLIS_SHORT: number = 3000;
const CLOCK_SYNC_INTERVAL_MILLIS: number = 30_000;

const socketSignal = signal<Socket | null>(null);
export const socketConnected = signal<boolean>(false);

export async function authenticateWithDiscord(discordSdk: AbstractDiscordSdk): Promise<BackendApiFacade> {
  const cachedApiData = window.__API_CACHE__ as ApiCache;

  if (cachedApiData) {
    console.log('[INIT] Using cached, authorized ApiFacade - bypassing SDK authentication.');
    return new BackendApiFacade(cachedApiData.instanceId, cachedApiData.authResult);
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

  const accessToken = await BackendApiFacade.requestAccessToken(code);

  const authResult: AuthenticationResult = await withTimeout<any>(
    discordSdk.commands.authenticate({ access_token: accessToken }),
    CONNECTION_TIMEOUT_MILLIS_LONG,
    'Discord User Authentication reached timeout'
  );

  // Cache the API metadata in the current iframe
  window.__API_CACHE__ = { instanceId: discordSdk.instanceId, authResult } satisfies ApiCache;

  console.log('[INIT] Authentication complete. Connected to Discord and YASQ backends.');
  return new BackendApiFacade(discordSdk.instanceId, authResult);
}

export function establishServerConnection(instanceId: string, authToken: string) {
  console.log('[INIT] Establishing WebSocket...');
  if (socketSignal.value) {
    socketSignal.value.disconnect();
  }

  const socket = io({ auth: { token: authToken } });
  socketSignal.value = socket;
  trackConnectionStatus(socketSignal.value);

  socket.on('connect', async () => {
    console.log('[DIAGNOSTICS] Socket connected! Emitting JOIN_INSTANCE event');
    socket.emit(GameEvent.JOIN_INSTANCE, { instanceId });

    void syncClockWithServer();
  });
  socket.io.on('reconnect', async attempt => {
    console.log(`[DIAGNOSTICS] Socket reconnected successfully on attempt ${attempt}...`);
    socket.emit(GameEvent.JOIN_INSTANCE, { instanceId });

    void syncClockWithServer();
  });
  socket.on('disconnect', reason => {
    console.warn(`[DIAGNOSTICS] Socket disconnected. Reason: ${reason}`);
  });

  // Listen for game state updates
  socket.on(GameEvent.GAME_STATE_UPDATED, updatedState => {
    gameStatus.value = updatedState;
    if (updatedState.participants) {
      participants.value = updatedState.participants;
    }
  });

  // Periodically re-sync local clock with the server's clock
  setInterval(() => void syncClockWithServer(4), CLOCK_SYNC_INTERVAL_MILLIS);

  // React to network (dis)connections
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
    Events.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE,
    (e: ParticipantsPayload) => (participantsSignal.value = e.participants)
  );
}

/**
 * Subscribes a handler to the given game event and returns an unsubscribe function for clean-up.
 */
export function onGameEvent<T = any>(event: TGameEvent, callback: (data: T) => void): () => void {
  const socket = socketSignal.value;
  if (!socket) return () => {};

  socket.on(event, callback);

  return () => {
    socketSignal.value?.off(event, callback);
  };
}

/**
 * Registers a **one-shot** callback for the next time the given {@link GameEvent} occurs.
 * Returns an unsubscribe function to cancel this event callback.
 */
export function onNextGameEvent<T = any>(event: TGameEvent, callback: (data: T) => void): () => void {
  const socket = socketSignal.value;
  if (!socket) return () => {};

  socketSignal.value?.once(event, callback);

  return () => {
    socketSignal.value?.off(event, callback);
  };
}

/**
 * Emits a {@link GameEvent} to the YASQ backend server.
 */
export function emitGameEvent(event: TGameEvent, ...data: unknown[]) {
  socketSignal.value?.emit(event, data);
}
