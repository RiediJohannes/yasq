import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { GameInstance } from '../src/models/game_instance.js';
import {
  GameState,
  INSTANCE_PATH,
  Joker,
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
import { LogCategory, logger } from '../src/utils/logger.js';
import { authenticateUser, createGameMiddleware } from './middleware.js';
import { exchangeCodeForToken } from '../src/utils/discord.js';
import { generateSampleTimeBonusSummary, SAMPLE_PARTICIPANTS } from '../src/utils/samples.js';

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
      return res.status(400).send({ error: 'Missing code' });
    }

    try {
      const accessToken = await exchangeCodeForToken(code);
      res.send({ access_token: accessToken });
    } catch (err: any) {
      logger.error('SYSTEM', `OAuth2 token exchange failed`, err.message, LogCategory.AUTH);
      res.status(500).send({ error: 'Authentication failed' });
    }
  });

  router.post('/log', (req, res) => {
    const { level, message, user } = req.body;
    // TODO Improve this endpoint
    console.log(`[CLIENT-${level}] User ${user}: ${message}`);
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
      return res.status(403).send({ error: 'Joker not enabled for this game' });
    }

    if (!game.canUseJoker(userId, jokerType)) {
      return res.status(403).send({ error: 'Joker already used' });
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
          return res.status(400).send({ error: 'Spy Joker requires a targetId' });
        }

        hint = game.getSpyHint(targetId);
        if (hint === null) {
          return res.status(202).send({
            error: "Target hasn't submitted yet.\nJoker not consumed.",
          });
        }
        break;
      case Joker.GLIMPSE:
        hint = await game.getGlimpseHint();
        if (hint === null) {
          return res.status(500).send({
            error: 'Failed to generate blurred image.\nJoker not consumed.',
          });
        }
        break;
      default:
        return res.status(400).send({ error: 'Invalid joker type' });
    }

    game.markJokerUsed(userId, jokerType);
    logger.debug(game.instanceId, `Player ${userId} has used Joker ${jokerType}`, LogCategory.GAME);

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
      return res.status(403).send({ error: 'User not registered in this instance.' });
    }

    if (guess.length > MAX_GUESS_LENGTH) {
      return res.status(400).send({
        error: `Guess must be between 1 and ${MAX_GUESS_LENGTH} characters.`,
      });
    }

    const { current, total } = game.submitGuess(userId, guess);
    logger.debug(
      game.instanceId,
      `Guess submitted by player ${userId}; ${current}/${total} players have guessed`,
      LogCategory.GAME
    );

    if (game.state === GameState.HOST_REVIEW) {
      logger.debug(game.instanceId, `Game moved to state: ${game.state}`, LogCategory.GAME);
    }

    game.notifyUpdate();

    res.send({ status: 'submitted' });
  });

  router.get(`/${INSTANCE_PATH}/round-results`, async (req, res) => {
    const userId = (req.query.user_id || req.query.userId) as string;
    const game = req.game!;

    if (game?.state !== GameState.ROUND_RESULTS) {
      return res.status(400).send({ error: 'Results not ready yet.' });
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
      return res.status(400).send({ error: 'Game has not finished yet.' });
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
          console.error('Error transferring file to client:', err);
          if (!res.headersSent) {
            res.status(500).send('Could not download file.');
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
