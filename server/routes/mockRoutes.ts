import express from 'express';

import { GameInstance } from '../src/models/game_instance.js';
import { Leaderboard } from '../src/models/leaderboard.js';
import { LogCategory, logger } from '../src/utils/logger.js';
import { INSTANCE_PATH } from '@yasq/shared';
import { createGameMiddleware } from './middleware.js';
import { ApiError } from './errors.js';

export const setupMockRoutes = (
  instances: Record<string, GameInstance>,
  notifyGameSubscribers: (updatedGame: GameInstance) => void
) => {
  const fetchGame = createGameMiddleware(instances);
  const router = express.Router();

  router.post(`/${INSTANCE_PATH}`, (req, res) => {
    const instanceId = (req.params as { instanceId?: string })?.instanceId;

    if (!instanceId) throw new ApiError(400, 'Missing property: instanceId', req);

    const createdGame = setMockState(req.body);
    createdGame.onUpdate = notifyGameSubscribers;
    instances[instanceId] = createdGame;

    createdGame.notifyUpdate();

    res.status(200).send({ message: 'Mock data loaded', instance: createdGame });
  });

  router.patch(`/${INSTANCE_PATH}`, fetchGame, (req, res) => {
    const game = req.game!;

    if (!game) {
      throw new ApiError(404, 'Instance not found', req);
    }

    const updates = req.body;

    if (updates.state !== undefined) game.state = updates.state;
    if (updates.currentRound !== undefined) game.currentRound = updates.currentRound;
    if (updates.hostId !== undefined) game.hostId = updates.hostId;
    if (updates.currentGame !== undefined) game.currentGame = updates.currentGame;
    if (updates.lastWinnerId !== undefined) game.lastWinnerId = updates.lastWinnerId;
    if (updates.registeredUsers) {
      game.registeredUsers = new Set(updates.registeredUsers.map((u: any) => (typeof u === 'string' ? u : u.id)));
    }
    if (updates.readyUsers) {
      game.readyUsers = new Set(updates.readyUsers);
    }
    if (updates.trackHistory) {
      game.trackHistory = updates.trackHistory;
    }
    if (updates.settings) {
      game.settings = {
        ...game.settings,
        ...updates.settings,
        enabledJokers: new Set(updates.settings.enabledJokers ?? []),
      };
    }
    if (updates.trackInfo) {
      game.trackInfo = {
        url: updates.trackInfo.url,
        startTime: updates.trackInfo.startTime,
        endTime: updates.trackInfo.endTime,
        track: updates.trackInfo.track,
        gameCoverUrl: updates.trackInfo.gameCoverUrl,
      };
    }
    if (updates.guesses) {
      game.guesses = updates.guesses;
    }
    if (updates.leaderboard) {
      game.leaderboard = Leaderboard.fromJSON(updates.leaderboard);
    }
    if (updates.usedJokers) {
      game.usedJokers = updates.usedJokers;
    }
    if (updates.streaks) {
      game.streaks = updates.streaks;
    }
    if (updates.currentRoundLostStreaks) {
      game.currentRoundLostStreaks = updates.currentRoundLostStreaks;
    }

    game.notifyUpdate();

    res.status(200).send({ message: 'Instance updated', instance: game });
  });

  router.delete(`/${INSTANCE_PATH}`, fetchGame, (req, res) => {
    const game = req.game!;
    const instanceId = game.instanceId;

    if (instances[instanceId]) {
      game.dispose();
      delete instances[instanceId];
      logger.debug(`Successfully deleted test instance`, LogCategory.GENERAL, instanceId);

      return res.status(200).send({ message: `Instance ${instanceId} deleted` });
    }

    res.status(204).send();
  });

  return router;
};

export function setMockState(stateData: any): GameInstance {
  const instanceId = stateData.instanceId || 'test-instance';
  const hostId = stateData.hostId || stateData.registeredUsers?.[0]?.id;

  const game = new GameInstance(instanceId, hostId);

  // Assign standard properties
  Object.assign(game, stateData);

  // Assign complex fields and Sets
  if (stateData.registeredUsers) {
    const registeredUserIds = stateData.registeredUsers.map((u: any) => (typeof u === 'string' ? u : u.id));
    game.registeredUsers = new Set(registeredUserIds);
  }

  if (stateData.readyUserIds) {
    game.readyUsers = new Set(stateData.readyUserIds);
  }

  if (stateData.settings?.enabledJokers) {
    game.settings = {
      ...game.settings,
      enabledJokers: new Set(stateData.settings.enabledJokers),
    };
  }

  if (stateData.leaderboard) {
    game.leaderboard = Leaderboard.fromJSON(stateData.leaderboard);
  }

  return game;
}
