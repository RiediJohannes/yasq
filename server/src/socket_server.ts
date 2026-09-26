import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { GameInstance } from './models/game_instance.js';
import { broadcastGameStatus, getGameStatusPayload, isMockMode, validateToken } from './helper.js';
import { COUNTDOWN_DURATION, GameEvent, type RoundTimingData } from '@yasq/shared';
import { LogCategory, logger } from './utils/logger.js';

const DISCONNECTION_GRACE_MILLIS: number = 20_000;

const disconnectTimeouts = new Map<string, NodeJS.Timeout>();
const clientLatencies = new Map<string, number>();

export function setupWebsocketServer(httpServer: HttpServer, instances: Record<string, GameInstance>): Server {
  const server = new Server(httpServer, {
    pingInterval: 4000,
    pingTimeout: 4000,
    cors: {
      origin: '*',
    },
  });

  const notifyGameSubscribers = (updatedGame: GameInstance) => broadcastGameStatus(server, updatedGame);

  const readyClientsMap = new Map<string, Set<string>>(); // instanceId -> Set of socketIds

  function startRoundForInstance(game: GameInstance, maxSetupDuration: number) {
    readyClientsMap.delete(game.instanceId);

    const MIN_READY_DISPLAY_MILLIS = 1500;
    const maxClientLatency = Math.max(...clientLatencies.values());
    const minimumWaitingTime = MIN_READY_DISPLAY_MILLIS - maxSetupDuration;
    const startTime = Date.now() + COUNTDOWN_DURATION + Math.max(minimumWaitingTime, maxClientLatency);
    const endTime = startTime + game.settings.maxGuessTime;

    // Broadcast round start event
    server.to(game.instanceId).emit(GameEvent.ROUND_STARTING, {
      startTime,
      endTime,
    } satisfies RoundTimingData);
  }

  server.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Missing token'));

    try {
      // Bind user ID to socket so it's available everywhere
      socket.data.userId = await validateToken(token);
      next();
    } catch (err) {
      next(new Error(`Invalid token: ${err}`));
    }
  });

  server.on('connection', socket => {
    socket.on(GameEvent.REQUEST_TIME, (callback: (serverTime: number) => void) => {
      if (typeof callback === 'function') {
        callback(Date.now());
      }
    });

    socket.on('disconnect', () => {
      const { userId, instanceId } = socket.data;
      if (!userId || !instanceId || !instances[instanceId]) return;

      logger.debug(`User ${userId} disconnected from server -> Starting grace period`, LogCategory.GAME, instanceId);
      const timeoutKey = `${instanceId}:${userId}`;

      // Clear any existing timeout
      if (disconnectTimeouts.has(timeoutKey)) {
        clearTimeout(disconnectTimeouts.get(timeoutKey));
      }

      // Give the client a grace period to reconnect before stripping their host/player status
      const disconnectTimeout = setTimeout(() => {
        disconnectTimeouts.delete(timeoutKey);

        const currentGame = instances[instanceId];
        if (!currentGame) return;

        currentGame.registeredUsers.delete(userId);
        logger.debug(`User ${userId}: Grace period expired -> Removing user from game`, LogCategory.GAME, instanceId);

        if (currentGame.isHost(userId) && !isMockMode()) {
          const isGameActive = currentGame.pickNewHost();

          if (!isGameActive) {
            logger.debug('Terminating empty game instance', LogCategory.GAME, instanceId);
            currentGame.dispose();
            delete instances[instanceId];
          }
        }

        server.to(instanceId).emit(GameEvent.GAME_STATE_UPDATED, getGameStatusPayload(currentGame));
      }, DISCONNECTION_GRACE_MILLIS);

      disconnectTimeouts.set(timeoutKey, disconnectTimeout);
    });

    socket.on(GameEvent.TIME_SYNCED, (determinedTimeOffset: number) => {
      const userId = socket.data.userId;
      if (userId) {
        console.log(`Clock offset of user ${userId} is now ${determinedTimeOffset}ms`);
        clientLatencies.set(userId, determinedTimeOffset);
      }
    });

    socket.on(GameEvent.JOIN_INSTANCE, async ({ instanceId }) => {
      const userId = socket.data.userId;
      socket.data.instanceId = instanceId;

      // Find and disconnect any other existing sockets for this user in the same instance
      const sockets = await server.in(instanceId).fetchSockets();
      for (const s of sockets) {
        if (s.data.userId === userId && s.id !== socket.id) {
          s.disconnect(true);
        }
      }

      socket.join(instanceId);

      // If the user reconnected within grace period, cancel their timeout for removal
      const timeoutKey = `${instanceId}:${userId}`;
      const isReconnecting = disconnectTimeouts.has(timeoutKey);

      if (isReconnecting) {
        clearTimeout(disconnectTimeouts.get(timeoutKey));
        disconnectTimeouts.delete(timeoutKey);
        logger.debug(`User ${userId} reconnected within grace period`, LogCategory.GAME, instanceId);
      }

      // If no one has registered for this instance yet, this user is the host
      if (!instances[instanceId]) {
        const game = new GameInstance(instanceId, userId);
        game.onUpdate = notifyGameSubscribers;
        instances[instanceId] = game;
      }

      const game = instances[instanceId];
      game.registeredUsers.add(userId);

      if (!isReconnecting) {
        logger.debug(
          `User ${userId} joined the game (role: ${game.isHost(userId) ? 'Host' : 'Player'})`,
          LogCategory.GAME,
          instanceId
        );
      }

      // Broadcast updated state to everyone in this game instance
      server.to(instanceId).emit(GameEvent.GAME_STATE_UPDATED, getGameStatusPayload(game));
    });

    socket.on(GameEvent.READY_TO_PLAY, ({ setupDuration }) => {
      const instanceId = socket.data.instanceId;
      const game = instances[instanceId];
      if (!game) return;

      // TODO Put this whole "readyForPlaying" logic INTO the game instance and ask game.allReady() below
      if (!readyClientsMap.has(instanceId)) {
        readyClientsMap.set(instanceId, new Set());
      }

      const readySet = readyClientsMap.get(instanceId)!;
      readySet.add(socket.id);

      // Check if all participants in the instance are ready (or implement a max 4s fallback timeout)
      const totalParticipants = game.getNumberOfParticipants();
      if (readySet.size >= totalParticipants) {
        startRoundForInstance(game, setupDuration);
      }
    });
  });

  return server;
}
