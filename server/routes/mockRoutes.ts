import express, { type Router } from 'express';

import { GameInstance } from '../src/models/game_instance.js';
import { Leaderboard } from '../src/models/leaderboard.js';
import { LogCategory, logger } from '../src/utils/logger.js';
import { INSTANCE_PATH } from '@yasq/shared';
import { createFetchGameMiddleware, defineSchema, validateRequest } from './middleware.js';
import { ApiError } from './errors.js';
import { AchievementBonusManager } from '../src/models/achievement_bonus.js';
import { userDataCache } from '../src/utils/helper.js';
import { z } from 'zod';

export const setupMockRoutes = (
  instances: Record<string, GameInstance>,
  notifyGameSubscribers: (updatedGame: GameInstance) => void
): Router => {
  const fetchGame = createFetchGameMiddleware(instances);
  const router = express.Router();

  const createInstanceParamsSchema = defineSchema({
    instanceId: z.string().trim().nonempty(),
  });

  router.post(`/${INSTANCE_PATH}`, (req, res) => {
    const { instanceId } = validateRequest(req, createInstanceParamsSchema);

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

    if (updates.state) {
      game.state = {
        ...game.state,
        ...updates.state,
      };
    }
    if (updates.hostId !== undefined) game.hostId = updates.hostId;
    if (updates.lastWinnerId !== undefined) game.lastWinnerId = updates.lastWinnerId;
    if (updates.registeredUsers) {
      game.registeredUsers = new Set(updates.registeredUsers.map((u: any) => (typeof u === 'string' ? u : u.id)));
    }
    if (updates.readyPlayers) {
      game.readyPlayers = new Set(updates.readyPlayers);
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

  if (stateData.state) {
    stateData.state = {
      ...game.state,
      ...stateData.state,
    };
  }

  // Assign standard properties
  Object.assign(game, stateData);

  // Assign complex fields and Sets
  if (stateData.registeredUsers) {
    const registeredUserIds = stateData.registeredUsers.map((u: any) => (typeof u === 'string' ? u : u.id));
    game.registeredUsers = new Set(registeredUserIds);
  }

  if (stateData.readyPlayers) {
    game.readyPlayers = new Set(stateData.readyPlayers);
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

  if (stateData.achievements) {
    game.achievementBonusManager = AchievementBonusManager.fromJSON(stateData.achievements);
  }

  if (stateData.userData) {
    userDataCache.clear();
    for (const user of stateData.userData) {
      userDataCache.set(user.id, user);
    }
  }

  return game;
}
