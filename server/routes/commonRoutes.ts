import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { GameInstance } from '../src/models/game_instance.js';
import {
  deserializeError,
  GameState,
  INSTANCE_PATH,
  Joker,
  LogLevel,
  MAX_GUESS_LENGTH,
  type Participant,
  STATIC_FILES_DIR,
  TEMP_FILES_DIR,
  TimeBonus,
  type TimeBonusSummary,
  type Track,
} from '@yasq/shared';
import { userDataCache } from '../src/helper.js';
import { generateResultsImage, isPlaywrightExecutableInstalled } from '../src/export_results.js';
import { LogCategory, type LogContext, logger } from '../src/utils/logger.js';
import { authenticateUser, createGameMiddleware } from './middleware.js';
import { exchangeCodeForToken } from '../src/utils/discord.js';
import { generateSampleTimeBonusSummary, SAMPLE_PARTICIPANTS } from '../src/utils/samples.js';
import { ApiError } from './errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const setupCommonRoutes = (instances: Record<string, GameInstance>, getTracks: () => Track[]) => {
  const fetchGame = createGameMiddleware(instances);
  const router = express.Router();

  // Automatically run this middleware for all paths starting with an instance resource identifier
  router.use(`/${INSTANCE_PATH}`, fetchGame);

  router.post('/auth/token', async (req, res) => {
    const { code } = req.body;

    if (!code) {
      throw new ApiError(400, 'Missing property: code', req);
    }

    try {
      const accessToken = await exchangeCodeForToken(code);
      res.send({ access_token: accessToken });
    } catch (err: unknown) {
      logger.error(`OAuth2 token exchange failed`, LogCategory.AUTH, null, err as Error);
      throw new ApiError(500, 'Authentication failed', req);
    }
  });

  router.post('/log', (req, res) => {
    const { level, message, instanceId, userId, error } = req.body ?? {};

    if (!message) {
      throw new ApiError(400, 'Missing property: message', req);
    }
    if (typeof level !== 'number' || !(level in LogLevel)) {
      throw new ApiError(400, `Unknown log level ${level}`, req);
    }

    const logContext: LogContext = {
      instanceId,
      clientUserId: userId,
      error: deserializeError(error),
    };

    logger.log(level, message, LogCategory.CLIENT, logContext);

    res.sendStatus(200);
  });

  router.patch(`/${INSTANCE_PATH}/ready`, authenticateUser, async (req, res) => {
    const isReady = req.body.ready;
    const userId = req.userId!;
    const game = req.game!;

    if (isReady) {
      game.readyUsers.add(userId);
    } else {
      game.readyUsers.delete(userId);
    }

    game.notifyUpdate();

    res.send({
      readyUsers: [...game.readyUsers],
    });
  });

  router.get(`/${INSTANCE_PATH}/current-track`, authenticateUser, async (req, res) => {
    const userId = req.userId!;
    const game = req.game!;

    if (game?.state === GameState.PLAYING) {
      const trackInfo = game.trackInfo;

      const response: any = {
        url: trackInfo?.url,
        startTime: trackInfo?.startTime,
        endTime: trackInfo?.endTime,
      };

      // Host exclusive information
      if (game.isHost(userId)) {
        response.correctAnswer = trackInfo?.track.game;
        response.trackTitle = trackInfo?.track.title;
        response.tags = trackInfo?.track.tags || [];
        response.gameCover = trackInfo?.gameCoverUrl;
      }

      return res.send(response);
    }

    res.send({ url: null, startTime: 0, endTime: 0 });
  });

  router.get(`/${INSTANCE_PATH}/available-jokers`, authenticateUser, async (req, res) => {
    const userId = req.userId!;
    const game = req.game!;

    // Filter out the ones the user has already used
    const available = [...game.settings.enabledJokers].filter(joker => game.canUseJoker(userId, joker));

    res.send({
      available,
      used: Object.keys(game.usedJokers[userId] || []),
    });
  });

  router.patch(`/${INSTANCE_PATH}/jokers`, authenticateUser, async (req, res) => {
    const { jokerType, targetId } = req.body;
    const userId = req.userId!;
    const game = req.game!;

    if (!game.settings.enabledJokers.has(jokerType)) {
      throw new ApiError(403, 'Joker not enabled for this game', req);
    }

    if (!game.canUseJoker(userId, jokerType)) {
      throw new ApiError(403, 'Joker already used', req);
    }

    let hint: any;
    switch (jokerType) {
      case Joker.OBFUSCATION:
        hint = game.getPartialHint();
        break;
      case Joker.TRIVIA:
        hint = game.getTagHint();
        break;
      case Joker.MULTIPLE_CHOICE:
        hint = game.getMultipleChoiceHint(getTracks());
        break;
      case Joker.SPY:
        if (!targetId) {
          throw new ApiError(400, 'Spy joker requires additional property: targetId', req);
        }

        hint = game.getSpyHint(targetId);
        if (hint === null) {
          throw new ApiError(202, "Target hasn't submitted yet.\nJoker not consumed.", req);
        }
        break;
      case Joker.GLIMPSE:
        hint = await game.getGlimpseHint();
        if (hint === null) {
          throw new ApiError(500, 'Failed to generate blurred image.\nJoker not consumed.', req);
        }
        break;
      default:
        throw new ApiError(400, `Invalid joker type: ${jokerType}`, req);
    }

    game.markJokerUsed(userId, jokerType);
    logger.debug(`Player ${userId} has used Joker ${jokerType}`, LogCategory.GAME, game.instanceId);

    game.notifyUpdate();

    res.send({
      jokerType,
      hint,
    });
  });

  router.post(`/${INSTANCE_PATH}/guesses`, authenticateUser, async (req, res) => {
    const guess = req.body?.guess;
    const userId = req.userId!;
    const game = req.game!;

    if (!game.registeredUsers.has(userId)) {
      throw new ApiError(403, `User ${userId} is not registered with this instance.`, req);
    }

    if (guess.length > MAX_GUESS_LENGTH) {
      throw new ApiError(400, `Guess must be between 1 and ${MAX_GUESS_LENGTH} characters.`, req);
    }

    const { current, total } = game.submitGuess(userId, guess);
    logger.debug(
      `Guess submitted by player ${userId}; ${current}/${total} players have guessed`,
      LogCategory.GAME,
      game.instanceId
    );

    if (game.state === GameState.HOST_REVIEW) {
      logger.debug(`Game moved to state: ${game.state}`, LogCategory.GAME, game.instanceId);
    }

    game.notifyUpdate();

    res.send({ status: 'submitted' });
  });

  router.get(`/${INSTANCE_PATH}/round-results`, async (req, res) => {
    const userId = (req.query.user_id || req.query.userId) as string;
    const game = req.game!;

    if (game?.state !== GameState.ROUND_RESULTS) {
      throw new ApiError(400, 'Results not ready yet.', req);
    }

    // Get the result for the current round of the requested user
    const roundResult = game.leaderboard.getRoundResults(game.currentRound, game.isHost(userId) ? undefined : userId);

    const roundSummary = game.leaderboard.getRoundSummary(game.currentRound);

    const correctPlayers = game.leaderboard.getAll().flatMap(playerEntry => {
      const currentRoundResult = playerEntry.roundHistory.findLast(r => r.round === game.currentRound);
      return currentRoundResult?.scoreValue === 1 ? [playerEntry.userId] : [];
    });

    res.send({
      round: game.currentRound,
      result: roundResult,
      summary: roundSummary,
      correctAnswer: game.trackInfo?.track.game,
      trackTitle: game.trackInfo?.track.title,
      tags: game.trackInfo?.track.tags || [],
      gameCover: game.trackInfo?.gameCoverUrl,
      correctPlayers: correctPlayers,
      lostStreaks: game.currentRoundLostStreaks,
    });
  });

  router.get(`/${INSTANCE_PATH}/final-results`, async (req, res) => {
    const game = req.game!;

    if (game?.state !== GameState.FINAL_RESULTS) {
      throw new ApiError(400, 'Game has not finished yet.', req);
    }

    // Download a screenshot of the final results instead of displaying them in the view
    const isDownload = req.headers['content-disposition'] === 'attachment' || req.query.download !== undefined;

    if (isDownload) {
      const filePath = path.join(__dirname, '..', STATIC_FILES_DIR, TEMP_FILES_DIR, `${game.instanceId}/results.png`);
      if (!fs.existsSync(filePath)) {
        await generateResultsImage(
          game.instanceId,
          game.temporaryDirectory(true),
          game.leaderboard,
          userDataCache,
          game.gameStats
        );
      }

      return res.download(filePath, `yasq-results.png`, err => {
        if (err) {
          logger.error('Error transferring file to client', LogCategory.GAME, game.instanceId, err);
          if (!res.headersSent) {
            throw new ApiError(500, 'Failed to download file.', req);
          }
        }
      });
    }

    res.send({
      leaderboard: game.leaderboard.getAll() || [],
      gameStats: game.gameStats || {},
      canExport: isPlaywrightExecutableInstalled(),
    });
  });

  router.get(`/samples/time-bonus/:timeBonusType/summary`, async (req, res) => {
    const bonusType = req.params.timeBonusType as TimeBonus | undefined;

    if (!bonusType) {
      return res.send({
        participants: SAMPLE_PARTICIPANTS,
        timeBonusSummary: null,
      });
    }

    const participants: Participant[] = SAMPLE_PARTICIPANTS;
    const timeBonusSummary: TimeBonusSummary = generateSampleTimeBonusSummary(bonusType);

    res.send({
      participants: participants,
      timeBonusSummary: timeBonusSummary,
    });
  });

  return router;
};
