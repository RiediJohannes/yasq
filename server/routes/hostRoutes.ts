import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { APIChannel } from 'discord-api-types/v10';

import { GameInstance } from '../src/models/game_instance.js';
import {
  AchievementBonusMode,
  AchievementBonusType,
  FirstBonusMultiplier,
  GamePhase,
  GameSettings,
  INSTANCE_PATH,
  INT32_MAX_VALUE,
  Joker,
  type Playlist,
  RoundTimings,
  STATIC_FILES_DIR,
  StreakBonusMultiplier,
  TEMP_FILES_DIR,
  TimeBonus,
  type Track,
} from '@yasq/shared';
import { filterDiscordTextChannels, getCachedDisplayName, userDataCache } from '../src/helper.js';
import { isAllowed } from '../src/access_control.js';
import { generateResultsImage } from '../src/export_results.js';
import { LogCategory, logger } from '../src/utils/logger.js';
import { getChannelsForGuild, postResultsToChannel } from '../src/utils/discord.js';

import { authenticateUser, createFetchGameMiddleware, isHost, validateBody, validateParams } from './middleware.js';
import { ApiError } from './errors.js';
import * as g from './guards.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const setupHostRoutes = (
  instances: Record<string, GameInstance>,
  getTracks: () => Track[],
  getPlaylists: () => Playlist[]
) => {
  const fetchGame = createFetchGameMiddleware(instances);
  const router = express.Router();

  // Always run the full middleware chain on paths starting with an instance resource identifier
  // (note: isHost depends on the authenticateUser and fetchGame to run before it)
  router.use(`/${INSTANCE_PATH}`, authenticateUser, fetchGame, isHost);

  router.get(`/${INSTANCE_PATH}/tracks`, async (req, res) => {
    const userId = req.userId!;
    const game = req.game!;

    if (getTracks().length === game.trackHistory.length) {
      game.trackHistory = []; // Reset history if all tracks have been played
    }

    const tracks = getTracks()
      .filter((t: Track) => isAllowed(userId, t.audio))
      .map((t: Track, index: number) => ({
        id: index,
        game: t.game,
        title: t.title,
        audio: t.audio,
        cover: t.cover,
        played: game.trackHistory.includes(t.audio),
        tags: t.tags,
      }));

    res.json({
      tracks: tracks,
      playlists: getPlaylists(),
    });
  });

  router.put(`/${INSTANCE_PATH}/transfer`, async (req, res) => {
    const game = req.game!;
    const { newHostId } = validateBody(req, {
      newHostId: g.isOneOf([...game.registeredUsers]).else('New host must be a registered user'),
    });

    game.hostId = newHostId;
    game.readyPlayers.delete(newHostId); // New host is not required to be ready

    const hostName = getCachedDisplayName(newHostId);
    logger.debug(`Host changed to user '${hostName}' (${newHostId})`, LogCategory.GAME, game.instanceId);

    game.notifyUpdate();

    res.send({ status: 'success' });
  });

  router.post(`/${INSTANCE_PATH}/setup`, async (req, res) => {
    const maxAllowedGuessTime: number = Math.floor(INT32_MAX_VALUE / 1000) - RoundTimings.COUNTDOWN_DURATION;

    const { settings: validatedPayload } = validateBody(req, {
      settings: g.isObjectWith({
        rounds: g.isInteger.andPositive(),
        maxGuessTime: g.isInteger
          .inRange(1, maxAllowedGuessTime)
          .else(`Guess time must be between 1 and ${maxAllowedGuessTime} seconds`),
        enabledJokers: g.isArrayOf(g.isEnumValue(Joker)),
        firstBonusMultiplier: g.isEnumValue(FirstBonusMultiplier),
        timeBonus: g.isEnumValue(TimeBonus).orNull(),
        streakBonusMultiplier: g.isEnumValue(StreakBonusMultiplier),
        achievementBonuses: g
          .isObjectWith({
            mode: g.isEnumValue(AchievementBonusMode),
            enabledTypes: g.isArrayOf(g.isEnumValue(AchievementBonusType)),
            randomCount: g.isInteger.andNonNegative(),
          })
          .orUndefined(),
      }),
    });
    const settings = GameSettings.withJokerArray(validatedPayload);
    const game = req.game!;

    game.setupGame(settings);
    logger.debug(
      `Game settings have been set: ${JSON.stringify(
        {
          ...game.settings,
          enabledJokers: [...game.settings.enabledJokers],
        },
        null,
        2
      )}`,
      LogCategory.GAME,
      game.instanceId
    );

    game.notifyUpdate();

    res.send({ status: GamePhase.LOBBY });
  });

  router.post(`/${INSTANCE_PATH}/new`, async (req, res) => {
    const game = req.game!;

    game.restart();
    logger.debug(`Host has started new game #${game.state.game}`, LogCategory.GAME, game.instanceId);

    game.notifyUpdate();

    res.sendStatus(205); // 205 Reset Content (previous game is discarded)
  });

  router.post(`/${INSTANCE_PATH}/start`, async (req, res) => {
    const game = req.game!;

    game.startGame();
    logger.info(`Game started!`, LogCategory.GAME, game.instanceId);

    game.notifyUpdate();

    res.send({ status: GamePhase.TRACK_SELECTION });
  });

  router.post(`/${INSTANCE_PATH}/tracks/play`, async (req, res) => {
    const { fileName } = validateBody(req, { fileName: g.isString.andNonEmpty() });
    const userId = req.userId!;
    const game = req.game!;

    if (!isAllowed(userId, fileName)) {
      logger.warn(
        `User '${getCachedDisplayName(userId)}' (${userId}) attempted to play restricted track: ${fileName}`,
        LogCategory.SECURITY,
        game.instanceId
      );
      throw new ApiError(403, 'You do not have permission to play this track.', req);
    }

    const track = getTracks().find((t: Track) => t.audio === fileName);

    if (!track) throw new ApiError(404, 'Track not found.', req);

    await game.selectNextTrack(track);
    logger.debug(`Selected ${fileName} as next track`, LogCategory.GAME, game.instanceId);

    game.notifyUpdate();

    res.send({
      status: GamePhase.PLAYING,
      track: game.trackInfo,
    });
  });

  router.get(`/${INSTANCE_PATH}/guesses`, async (req, res) => {
    const game = req.game!;

    const currentRound = game.state.round;
    const roundGuesses = game.guesses[currentRound] || {};

    // Attach used jokers to guesses
    const guessesWithJokers = Object.fromEntries(
      Object.entries(roundGuesses).map(([userId, guess]) => {
        const userJokers = game.usedJokers[userId] || {};

        // Find which joker (if any) was used in this round
        const jokerUsed = Object.keys(userJokers).find(joker => userJokers[joker as Joker] === currentRound);

        return [userId, { ...guess, joker: jokerUsed }];
      })
    );

    const timedOutPlayers = game.getTimedOutPlayers();
    if (timedOutPlayers.length > 0) {
      const timedOutPlayerNames = timedOutPlayers.map(userId => getCachedDisplayName(userId)).join(', ');
      logger.debug(
        `The following players have not submitted a guess in time: ${timedOutPlayerNames}`,
        LogCategory.GAME,
        game.instanceId
      );
    }

    res.send({
      round: game.state.round,
      answer: game.trackInfo?.track.game,
      guesses: guessesWithJokers,
      timedOut: timedOutPlayers,
    });
  });

  router.post(`/${INSTANCE_PATH}/round-results`, async (req, res) => {
    const { corrections } = validateBody(req, { corrections: g.isRecordOf(g.isNumber) });
    const game = req.game!;

    logger.debug(
      `Host submitted corrections: ${JSON.stringify(corrections, null, 2)}`,
      LogCategory.GAME,
      game.instanceId
    );
    game.submitResults(corrections);

    logger.debug(
      `Results calculated for round #${game.state.round}: ${JSON.stringify(game.leaderboard.getRoundOverview(game.state.round))}`,
      LogCategory.GAME,
      game.instanceId
    );

    game.notifyUpdate();

    res.send({ status: GamePhase.ROUND_RESULTS });
  });

  router.post(`/${INSTANCE_PATH}/rounds/next`, async (req, res) => {
    const game = req.game!;

    if (game.state.phase !== GamePhase.ROUND_RESULTS) {
      throw new ApiError(409, 'Can only start next round after round results have been shown', req);
    }

    const newState = game.advanceRound();

    if (newState.phase === GamePhase.FINAL_RESULTS) {
      logger.info(`Game ended!`, LogCategory.GAME, game.instanceId);
      void generateResultsImage(
        game.instanceId,
        game.temporaryDirectory(true),
        game.leaderboard,
        userDataCache,
        game.gameStats
      );
      logger.debug(
        `Final leaderboard: ${JSON.stringify(game.leaderboard.getAll(), null, 2)}`,
        LogCategory.GAME,
        game.instanceId
      );
    }

    if (newState.phase === GamePhase.TRACK_SELECTION) {
      logger.debug(`Game has advanced to next round!`, LogCategory.GAME, game.instanceId);
    }

    game.notifyUpdate();

    res.send({ status: newState });
  });

  router.post(`/${INSTANCE_PATH}/results/send`, async (req, res) => {
    const { channelId } = validateBody(req, { channelId: g.isString.andNonEmpty() });
    const game = req.game!;

    if (game.state.phase !== GamePhase.FINAL_RESULTS) {
      throw new ApiError(409, 'Game has not finished yet.', req);
    }

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

    const winnerMention = `<@${game.lastWinnerId}>`;
    const messageText = `🏁 **The YASQ Game Has Ended!**\n\nCongratulations ${winnerMention}, you are the winner! 🥳\n\nHere are the final results:`;

    try {
      await postResultsToChannel(channelId, messageText, filePath, game.instanceId);

      logger.debug(`Results successfully posted to Discord channel ${channelId}`, LogCategory.DISCORD, game.instanceId);

      return res.json({ success: true });
    } catch (error: unknown) {
      logger.error(`Discord API rejected request`, LogCategory.DISCORD, game.instanceId, error as Error);
      throw new ApiError(500, 'Internal system operation processing failure.', req);
    }
  });

  router.get(`/${INSTANCE_PATH}/guild/:guildId/channels`, fetchGame, async (req, res) => {
    const { guildId } = validateParams(req, {
      guildId: g.isString,
    });
    const game = req.game!;

    // Return empty list if bot token is not set
    if (!process.env.DISCORD_BOT_TOKEN) {
      logger.warn(`DISCORD_BOT_TOKEN not set, returning empty list`, LogCategory.DISCORD, game.instanceId);
      return res.json([]);
    }

    try {
      const channels = (await getChannelsForGuild(guildId)) as APIChannel[];
      const textChannels = filterDiscordTextChannels(channels);

      res.json(textChannels);
    } catch (err: unknown) {
      logger.error(`Discord API rejected request`, LogCategory.DISCORD, game.instanceId, err as Error);
      throw new ApiError(500, 'Could not fetch channels', req);
    }
  });

  return router;
};
