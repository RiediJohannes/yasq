import { DiscordSDK } from '@discord/embedded-app-sdk';
import { mockDiscordSdk } from '../../../mock_data/mockDiscordSdk';
import { withTimeout } from './helper';
import * as backend from './backend';
import { gameState, participants } from '../main';
import { io, Socket } from 'socket.io-client';
import { GameEvent, Participant, TGameEvent } from '@yasq/shared';
import { Signal, signal } from '@preact/signals';

const CONNECTION_TIMEOUT_MILLIS_LONG: number = 10_000;
const CONNECTION_TIMEOUT_MILLIS_SHORT: number = 3000;
const CLOCK_SYNC_INTERVAL_MILLIS: number = 30_000;

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

  const { access_token } = await backend.requestAuthToken(code);

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
    gameState.value = updatedState;
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
    'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
    (e: ParticipantsPayload) => (participantsSignal.value = e.participants)
  );
}

let serverClockOffset = 0; // (Server Time - Client Time) in milliseconds

/**
 * Returns the current timestamp synchronized with the server clock.
 */
export const getSyncedServerTime = (): number => {
  return Date.now() + serverClockOffset;
};

/**
 * Measures the offset of the client's device clock to the server's internal clock (accounting for both clock inaccuracy
 * and network latency) in order to calculate a server-synced current time.
 * **Hint:** Use {@link getSyncedServerTime} to obtain the server-synced time.
 */
export const syncClockWithServer = async (sampleCount = 8): Promise<number> => {
  const socket = socketSignal.value;
  if (!socket || !socket.connected) return serverClockOffset;

  const samples: Array<{ clientOffset: number; roundTripTime: number }> = [];

  // Cristian's Algorithm (https://en.wikipedia.org/wiki/Cristian%27s_algorithm)
  for (let i = 0; i < sampleCount && socket.connected; i++) {
    await new Promise<void>(resolve => {
      const sendTime = Date.now();

      socket.emit(GameEvent.REQUEST_TIME, (serverTime: number) => {
        const receiveTime = Date.now();
        const roundTripTime = receiveTime - sendTime;

        const estimatedServerTimeAtReceive = serverTime + roundTripTime / 2;
        const offset = estimatedServerTimeAtReceive - receiveTime;

        samples.push({ clientOffset: offset, roundTripTime });
        resolve();
      });
    });

    // Small delay between sampling pings
    if (i < sampleCount - 1) {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // Sort by round-trip time (ascending)
  samples.sort((a, b) => a.roundTripTime - b.roundTripTime);

  // Use offset from the fastest packet exchange
  serverClockOffset = samples[0]!.clientOffset;
  console.log(
    `[TimeSync] Clock synced. Offset: ${serverClockOffset.toFixed(2)}ms (Best RTT: ${samples[0]!.roundTripTime}ms)`
  );

  socket.emit(GameEvent.TIME_SYNCED, -serverClockOffset);

  return serverClockOffset;
};

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
 * Emits a {@link GameEvent} to the backend server.
 */
export function emitGameEvent<T = any>(event: TGameEvent, data: T) {
  socketSignal.value?.emit(event, data);
}
