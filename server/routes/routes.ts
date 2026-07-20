import express from 'express';
import type { Server } from "socket.io";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { GameInstance, Track } from '../src/models.js';
import type { InstanceGuildQuery, InstanceQuery, InstanceUserQuery } from '../src/types.js';
import { COUNTDOWN_DURATION, GameState, INT32_MAX_VALUE, Joker, MAX_GUESS_LENGTH } from '@yasq/shared';
import { broadcastGameStatus, filterDiscordTextChannels, userDataCache } from '../src/helper.js';
import { isAllowed } from '../src/access_control.js';
import { generateResultsImage } from '../src/export_results.js';
import { LogCategory, logger } from '../src/utils/logger.js';
import { createGameMiddlewares } from './middleware.js';
import type { APIChannel } from 'discord-api-types/v10';
import { exchangeCodeForToken, getChannelsForGuild, postResultsToChannel } from '../src/utils/discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const setupRoutes = (server: Server, instances: Record<string, GameInstance>, allTracks: any, allPlaylists: any) => {
  const { authenticateUser, fetchGame, isHost } = createGameMiddlewares(instances);
  const router = express.Router();

  const triggerUpdate = (instanceId: string): void => {
    const game = instances[instanceId];
    if (game) {
      broadcastGameStatus(server, instanceId, game);
    }
  };

  router.post("/token", async (req, res) => {
    const { code } = req.body;

    if (!code) {
      return res.status(400).send({ error: "Missing code" });
    }

    try {
      const accessToken = await exchangeCodeForToken(code);
      res.send({ access_token: accessToken });
    } catch (err: any) {
      logger.error("SYSTEM", `OAuth2 token exchange failed`, err.message, LogCategory.AUTH);
      res.status(500).send({ error: "Authentication failed" });
    }
  });

  router.post("/log", (req, res) => {
    const { message, user } = req.body;
    console.log(`[CLIENT LOG] User ${user}: ${message}`);
    res.sendStatus(200);
  });

  router.post("/ready", authenticateUser, fetchGame, async (req, res) => {
    const { instanceId, ready } = req.body;
    const userId = req.userId!;
    const game = req.game!;

    if (ready) {
      game.readyUsers.add(userId);
    } else {
      game.readyUsers.delete(userId);
    }

    triggerUpdate(instanceId);

    res.send({
      readyUsers: [...game.readyUsers]
    });
  });

  router.post("/assign-host", authenticateUser, fetchGame, isHost, async (req, res) => {
    const { instanceId, newHostId } = req.body;
    const game = req.game!;

    if (!game.registeredUsers.has(newHostId)) {
      return res.status(400).send({ error: "New host must be a registered user" });
    }

    game.hostId = newHostId;
    game.readyUsers.delete(newHostId); // New host not required to be ready
    logger.debug(instanceId, `Host changed to user ${newHostId}`, LogCategory.GAME);

    triggerUpdate(instanceId);

    res.send({ status: "success" });
  });

  router.post("/setup-game", authenticateUser, fetchGame, isHost, async (req, res) => {
    const { instanceId, settings } = req.body;
    const game = req.game!;
    const maxAllowedDuration: number = Math.floor(INT32_MAX_VALUE / 1000) - COUNTDOWN_DURATION;

    if (settings.rounds <= 0 || settings.trackDuration <= 0) {
      return res.status(400).send({ error: "Rounds and track duration must be greater than 0." });
    }
    if (settings.trackDuration > maxAllowedDuration) {
      return res.status(400).send({ error: `Track duration must not exceed ${maxAllowedDuration}.` });
    }

    game.setupGame(settings);
    logger.debug(instanceId, `Game settings have been set: ${JSON.stringify({
      ...game.settings,
      enabledJokers: [...game.settings.enabledJokers]
    }, null, 2)}`, LogCategory.GAME);

    triggerUpdate(instanceId);

    res.send({ status: GameState.LOBBY });
  });

  router.post("/start-game", authenticateUser, fetchGame, isHost, async (req, res) => {
    const { instanceId } = req.body;
    const game = req.game!;

    game.startGame();
    logger.info(instanceId, `started!`, LogCategory.GAME);

    triggerUpdate(instanceId);

    res.send({ status: GameState.TRACK_SELECTION });
  });

  router.get("/track-list", authenticateUser, fetchGame, isHost, async (req, res) => {
    const userId = req.userId!;
    const game = req.game!;

    if (allTracks.length === game.trackHistory.length) {
      game.trackHistory = []; // Reset history if all tracks have been played
    }

    const tracks = allTracks
      .filter((t: any) => isAllowed(userId, t.audio))
      .map((t: Track, index: number) => ({
        id: index,
        game: t.game,
        title: t.title,
        audio: t.audio,
        cover: t.cover,
        played: game.trackHistory.includes(t.audio),
        tags: t.tags
      }));

    res.json({
      tracks: tracks,
      playlists: allPlaylists
    });
  });

  router.post("/submit-guess", authenticateUser, fetchGame, async (req, res) => {
    const { instanceId, guess } = req.body;
    const userId = req.userId!;
    const game = req.game!;

    if (!game.registeredUsers.has(userId)) {
      return res.status(403).send({ error: "User not registered in this instance." });
    }

    if (guess.length > MAX_GUESS_LENGTH) {
      return res.status(400).send({ error: `Guess must be between 1 and ${MAX_GUESS_LENGTH} characters.` });
    }

    const { current, total } = game.submitGuess(userId, guess);
    logger.debug(instanceId, `Guess submitted by player ${userId}; ${current}/${total} players have guessed`, LogCategory.GAME);

    if (game.state === GameState.ROUND_COMPLETED) {
      logger.debug(instanceId, `Game moved to state: ${game.state}`, LogCategory.GAME);
    }

    triggerUpdate(instanceId);

    res.send({ status: "submitted" });
  });

  router.get("/get-guesses", authenticateUser, fetchGame, isHost, async (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const game = req.game!;

    const currentRound = game.currentRound;
    const roundGuesses = game.guesses[currentRound] || {};

    // Attach used jokers to guesses
    const guessesWithJokers = Object.fromEntries(
      Object.entries(roundGuesses).map(([userId, guess]) => {
        const userJokers = game.usedJokers[userId] || {};

        // Find which joker (if any) was used in this round
        const jokerUsed = Object.keys(userJokers).find(
          (joker) => userJokers[joker as Joker] === currentRound
        );

        return [userId, { ...guess, joker: jokerUsed }];
      })
    );

    const timedOutPlayers = game.getTimedOutPlayers();
    if (timedOutPlayers.length > 0) {
      logger.debug(instanceId, `The following players have not submitted a guess in time: ${timedOutPlayers.join(', ')}`, LogCategory.GAME);
    }

    res.send({
      round: game.currentRound,
      answer: game.trackInfo?.track.game,
      guesses: guessesWithJokers,
      timedOut: timedOutPlayers
    });
  });

  router.post("/submit-round-results", authenticateUser, fetchGame, isHost, async (req, res) => {
    const { instanceId, corrections } = req.body;
    const game = req.game!;

    logger.debug(instanceId, `Host submitted corrections: ${JSON.stringify(corrections, null, 2)}`, LogCategory.GAME);
    game.submitResults(corrections);

    logger.debug(instanceId, `Results calculated for round #${game.currentRound}: ${JSON.stringify(game.leaderboard.getRoundResults(game.currentRound))}`, LogCategory.GAME);

    triggerUpdate(instanceId);

    res.send({ status: GameState.RESULTS });
  });

  router.get("/get-results", fetchGame, (req, res) => {
    const { userId } = req.query as InstanceUserQuery;
    const game = req.game!;

    if (game?.state !== GameState.RESULTS) {
      return res.status(400).send({ error: "Results not ready yet." });
    }

    // Get the result for the current round of the requested user
    const roundResult = game.leaderboard.getRoundSummary(
      game.currentRound,
      game.isHost(userId) ? undefined : userId
    );

    if (roundResult.length === 0) {
      return res.status(403).send({ error: "User not found in leaderboard." });
    }

    const correctPlayers = game.leaderboard.getAll().flatMap(playerEntry => {
      const currentRoundResult = playerEntry.roundHistory.findLast(r => r.round === game.currentRound);
      return currentRoundResult?.scoreValue === 1 ? [playerEntry.userId] : [];
    });

    res.send({
      round: game.currentRound,
      result: roundResult,
      correctAnswer: game.trackInfo?.track.game,
      trackTitle: game.trackInfo?.track.title,
      tags: game.trackInfo?.track.tags || [],
      gameCover: game.trackInfo?.gameCoverUrl,
      correctPlayers: correctPlayers,
      lostStreaks: game.currentRoundLostStreaks
    });
  });

  router.post("/start-next-round", authenticateUser, fetchGame, isHost, async (req, res) => {
    const { instanceId } = req.body;
    const game = req.game!;

    if (game.state !== GameState.RESULTS) {
      return res.status(403).send({ error: "Can only start next round after round results are shown" });
    }

    const newState = game.advanceRound();

    if (newState === GameState.GAME_FINISHED) {
      logger.info(instanceId, `Game ended!`, LogCategory.GAME);
      void generateResultsImage(game.instanceId, game.temporaryDirectory(true), game.leaderboard, userDataCache);
      logger.debug(instanceId, `Final leaderboard: ${JSON.stringify(game.leaderboard.getAll(), null, 2)}`, LogCategory.GAME);
    }

    if (newState === GameState.TRACK_SELECTION) {
      logger.debug(instanceId, `Game has advanced to next round!`, LogCategory.GAME);
    }

    triggerUpdate(instanceId);

    res.send({ status: newState });
  });

  router.post("/play-local", authenticateUser, fetchGame, isHost, async (req, res) => {
    const { fileName, instanceId } = req.body;
    const userId = req.userId!;
    const game = req.game!;

    if (!isAllowed(userId, fileName)) {
      logger.warn(instanceId, `User ${userId} attempted to play restricted track: ${fileName}`, LogCategory.SECURITY);
      return res.status(403).send({ error: "You do not have permission to play this track." });
    }

    const track = allTracks.find((t: Track) => t.audio === fileName);

    if (!track) {
      return res.status(400).send({ error: "Track not found." });
    }

    await game.playTrack(track, () => triggerUpdate(instanceId));

    logger.debug(instanceId, `Started playing ${fileName}`, LogCategory.GAME);

    triggerUpdate(instanceId);

    res.send({
      status: GameState.PLAYING,
      track: game.trackInfo
    });
  });

  router.get("/current-track", authenticateUser, fetchGame, async (req, res) => {
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

  router.get("/get-final-results", fetchGame, (req, res) => {
    const game = req.game!;

    if (game?.state !== GameState.GAME_FINISHED) {
      return res.status(400).send({ error: "Game has not finished yet." });
    }

    res.send({ leaderboard: game.leaderboard.getAll() || [] });
  });

  router.post("/restart-game", authenticateUser, fetchGame, isHost, async (req, res) => {
    const { instanceId } = req.body;
    const game = req.game!;

    game.restart();
    logger.debug(instanceId, `Host has started new game #${game.currentGame}`, LogCategory.GAME);

    triggerUpdate(instanceId);

    res.send({ success: true });
  });

  router.get("/get-available-jokers", authenticateUser, fetchGame, async (req, res) => {
    const userId = req.userId!;
    const game = req.game!;

    // Filter out the ones the user has already used
    const available = [...game.settings.enabledJokers].filter(joker =>
      game.canUseJoker(userId, joker)
    );

    res.send({
      available,
      used: Object.keys(game.usedJokers[userId] || [])
    });
  });

  router.post("/use-joker", authenticateUser, fetchGame, async (req, res) => {
    const { instanceId, jokerType, targetId } = req.body;
    const userId = req.userId!;
    const game = req.game!;

    if (!game.settings.enabledJokers.has(jokerType)) {
      return res.status(403).send({ error: "Joker not enabled for this game" });
    }

    if (!game.canUseJoker(userId, jokerType)) {
      return res.status(403).send({ error: "Joker already used" });
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
        hint = game.getMultipleChoiceHint(allTracks);
        break;
      case Joker.SPY:
        if (!targetId) {
          return res.status(400).send({ error: "Spy Joker requires a targetId" });
        }

        hint = game.getSpyHint(targetId);
        if (hint === null) {
          return res.status(202).send({ error: "Target hasn't submitted yet.\nJoker not consumed." });
        }
        break;
      case Joker.GLIMPSE:
        hint = await game.getGlimpseHint();
        if (hint === null) {
          return res.status(500).send({ error: "Failed to generate blurred image.\nJoker not consumed." });
        }
        break;
      default:
        return res.status(400).send({ error: "Invalid joker type" });
    }

    game.markJokerUsed(userId, jokerType);
    logger.debug(instanceId, `Player ${userId} has used Joker ${jokerType}`, LogCategory.GAME);

    triggerUpdate(instanceId);

    res.send({
      jokerType,
      hint
    });
  });

  router.get('/download-results', (req, res) => {
    const { instanceId } = req.query as InstanceQuery;

    const filePath = path.join(__dirname, `../data/temp/${instanceId}/results.png`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Results image has not been generated yet.' });
    }

    res.download(filePath, `yasq-results.png`, (err) => {
      if (err) {
        console.error("Error transferring file to client:", err);
        if (!res.headersSent) {
          res.status(500).send("Could not download file.");
        }
      }
    });
  });

  router.post('/post-results-to-channel', authenticateUser, fetchGame, isHost, async (req, res) => {
    const { instanceId, channelId } = req.body;
    const game = req.game!;

    const filePath = path.join(__dirname, `../data/temp/${instanceId}/results.png`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Results image has not been generated yet.' });
    }

    const winnerMention = `<@${game.lastWinnerId}>`;
    const messageText = `🏁 **The YASQ Game Has Ended!**\n\nCongratulations ${winnerMention}, you are the winner! 🥳\n\nHere are the final results:`;

    try {
      await postResultsToChannel(channelId, messageText, filePath, instanceId);

      logger.debug(instanceId, `Results successfully posted to Discord channel ${channelId}`, LogCategory.DISCORD);

      return res.status(200).json({ success: true });
    } catch (error: any) {
      logger.error(instanceId, `Discord API rejected request`, error.message, LogCategory.DISCORD);
      return res.status(500).json({ error: 'Internal system operation processing failure.' });
    }
  });

  router.get('/get-channels', authenticateUser, fetchGame, isHost, async (req, res) => {
    const { instanceId, guildId } = req.query as InstanceGuildQuery;

    // Return empty list if bot token is not set
    if (!process.env.DISCORD_BOT_TOKEN) {
      logger.warn(instanceId, `DISCORD_BOT_TOKEN not set, returning empty list`, LogCategory.DISCORD);
      return res.json([]);
    }

    try {
      const channels = await getChannelsForGuild(guildId) as APIChannel[];
      const textChannels = filterDiscordTextChannels(channels);

      res.json(textChannels);
    } catch (err: any) {
      logger.error(instanceId, `Discord API rejected request`, err.message, LogCategory.DISCORD);
      res.status(500).json({ error: 'Could not fetch channels' });
    }
  });

  return router;
};