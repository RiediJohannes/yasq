import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import type { Server } from "socket.io";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { GameInstance, Track } from '../src/models.js';
import type { InstanceQuery, InstanceUserQuery } from '../src/types.js';
import { COUNTDOWN_DURATION, GameState, INT32_MAX_VALUE, Joker } from '@yasq/shared';
import { broadcastGameStatus, invalidateToken, userDataCache, validateToken } from '../src/helper.js';
import { isAllowed } from '../src/access_control.js';
import { generateResultsImage } from '../src/export_results.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


declare global {
  namespace Express {
    // Extend Request type by additional optional fields
    interface Request {
      userId?: string;
      token?: string;
    }
  }
}

export const setupRoutes = (server: Server, instances: Record<string, GameInstance>, isMockMode: boolean, allTracks: any, allPlaylists: any) => {
  const router = express.Router();

  const triggerUpdate = (instanceId: string): void => {
    const game = instances[instanceId];
    if (game) {
      broadcastGameStatus(server, instanceId, game);
    }
  };

  /**
   * Authenticate a user via the Discord OAuth2 API based on the request's authorization header.
   */
  async function authenticateUser(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

    // store data for later use
    req.token = token;
    req.userId = userId;

    next(); // pass control to next route handler in the chain
  }

  router.post("/token", async (req, res) => {
    const { code } = req.body;

    if (isMockMode && code === 'mock_code') {
      return res.send({ access_token: 'mock_token_for_dev' });
    }

    // 1. Validate that we actually have the required data
    if (!code) {
      return res.status(400).send({ error: "Missing code" });
    }

    // 2. Cast or provide fallbacks for process.env
    const params = new URLSearchParams({
      client_id: process.env.VITE_DISCORD_CLIENT_ID || '',
      client_secret: process.env.DISCORD_CLIENT_SECRET || '',
      grant_type: "authorization_code",
      code: String(code),
    });

    // 3. Exchange the code for an access_token
    const response = await fetch(`https://discord.com/api/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    // 4. Return the access_token to our client as { access_token: "..."}
    const data = (await response.json()) as { access_token: string };

    res.send({ access_token: data.access_token });
  });

  router.post("/log", (req, res) => {
    const { message, user } = req.body;
    console.log(`[CLIENT LOG] User ${user}: ${message}`);
    res.sendStatus(200);
  });

  router.post("/ready", authenticateUser, async (req, res) => {
    const { instanceId, ready } = req.body;
    const userId = req.userId!;

    const game = instances[instanceId];

    if (!game) {
      return res.status(400).send({ error: "Instance not found" });
    }

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

  router.get("/ready-status", (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const game = instances[instanceId];

    if (!game) {
      return res.status(400).send({ error: "Instance not found" });
    }

    triggerUpdate(instanceId);

    res.send({
      readyUsers: [...game.readyUsers]
    });
  });

  router.post("/assign-host", authenticateUser, async (req, res) => {
    const { instanceId, newHostId } = req.body;
    const userId = req.userId!;

    const game = instances[instanceId];

    // Security check: only host can assign new host
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can assign new host" });
    }

    if (!game.registeredUsers.has(newHostId)) {
      return res.status(400).send({ error: "New host must be a registered user" });
    }

    game.hostId = newHostId;
    game.readyUsers.delete(newHostId); // New host not required to be ready
    console.log(`[HOST ASSIGNED] Host changed to ${newHostId} in instance ${instanceId}`);

    triggerUpdate(instanceId);

    res.send({ status: "success" });
  });

  router.post("/setup-game", authenticateUser, async (req, res) => {
    const { instanceId, settings } = req.body;
    const userId = req.userId!;
    const maxAllowedDuration: number = Math.floor(INT32_MAX_VALUE / 1000) - COUNTDOWN_DURATION;

    const game = instances[instanceId];

    // Security check: only host can set up a game
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can setup a game" });
    }

    if (settings.rounds <= 0 || settings.trackDuration <= 0) {
      return res.status(400).send({ error: "Rounds and track duration must be greater than 0." });
    }
    if (settings.trackDuration > maxAllowedDuration) {
      return res.status(400).send({ error: `Track duration must not exceed ${maxAllowedDuration}.` });
    }

    game.setupGame(settings);
    console.log(`[GAME] Instance ${instanceId} has been set up with settings: rounds: ${game.settings.rounds}, trackDuration: ${game.settings.trackDuration}, enabledJokers: ${[...game.settings.enabledJokers]}, firstBonusMultiplier: ${game.settings.firstBonusMultiplier}!`);

    triggerUpdate(instanceId);

    res.send({ status: GameState.LOBBY });
  });

  router.post("/start-game", authenticateUser, async (req, res) => {
    const { instanceId } = req.body;
    const userId = req.userId!;

    const game = instances[instanceId];

    // Security check: only host can start a game
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can start a game" });
    }

    game.startGame();
    console.log(`[GAME] Instance ${instanceId} has started!`);

    triggerUpdate(instanceId);

    res.send({ status: GameState.TRACK_SELECTION });
  });

  router.get("/track-list", authenticateUser, async (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const userId = req.userId!;

    const game = instances[instanceId];

    // Security check: only host can get track list
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can get track list" });
    }

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

  router.post("/submit-guess", authenticateUser, async (req, res) => {
    const { instanceId, guess } = req.body;
    const userId = req.userId!;

    const game = instances[instanceId];

    if (!game) {
      return res.status(400).send({ error: "Instance not found" });
    }

    if (!game.registeredUsers.has(userId)) {
      return res.status(403).send({ error: "User not registered in this instance." });
    }

    const { current, total } = game.submitGuess(userId, guess);
    console.log(`[GUESS] ${current}/${total} players have guessed.`);

    if (game.state === GameState.ROUND_COMPLETED) {
      console.log(`[STATE] Instance ${instanceId} moved to ROUND_COMPLETED`);
    }

    triggerUpdate(instanceId);

    res.send({ status: "submitted" });
  });

  router.get("/get-guesses", authenticateUser, async (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const userId = req.userId!;

    const game = instances[instanceId];

    // Security check: only host can get submitted guesses
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can get submitted guesses" });
    }

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
      console.log(`[TIMED OUT] The following players have not submitted a guess: ${timedOutPlayers}`);
    }

    res.send({
      round: game.currentRound,
      answer: game.trackInfo?.track.game,
      guesses: guessesWithJokers,
      timedOut: timedOutPlayers
    });
  });

  router.post("/submit-round-results", authenticateUser, async (req, res) => {
    const { instanceId, corrections } = req.body;
    const userId = req.userId!;

    const game = instances[instanceId];

    // Security check: only host can submit round results
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can submit round results" });
    }

    console.log(`[RESULTS] Host submitted corrections for instance ${instanceId}:`, corrections);
    game.submitResults(corrections);

    console.log(`[RESULTS] Results calculated for instance ${instanceId}: ${JSON.stringify(game.leaderboard.getRoundResults(game.currentRound))}.`);

    triggerUpdate(instanceId);

    res.send({ status: GameState.RESULTS });
  });

  router.get("/get-results", (req, res) => {
    const { instanceId, userId } = req.query as InstanceUserQuery;
    const game = instances[instanceId];

    if (game?.state !== GameState.RESULTS) {
      return res.status(400).send({ error: "Results not ready yet" });
    }

    // Get the most recent round result from the user's round history
    const roundResult = game.leaderboard.getRoundSummary(
      game.currentRound,
      game.isHost(userId) ? undefined : userId
    );

    if (roundResult.length === 0) {
      return res.status(403).send({ error: "User not found in leaderboard." });
    }

    const correctPlayersCount = game.leaderboard.getAll().filter(playerEntry =>
      playerEntry.roundHistory.some(r => r.round === game.currentRound && r.scoreValue === 1)
    ).length;

    res.send({
      round: game.currentRound,
      result: roundResult,
      correctAnswer: game.trackInfo?.track.game,
      trackTitle: game.trackInfo?.track.title,
      tags: game.trackInfo?.track.tags || [],
      gameCover: game.trackInfo?.gameCoverUrl,
      correctPlayers: correctPlayersCount,
      lostStreaks: game.currentRoundLostStreaks
    });
  });

  router.post("/start-next-round", authenticateUser, async (req, res) => {
    const { instanceId } = req.body;
    const userId = req.userId!;

    const game = instances[instanceId];

    // Security check: only host can start next round
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can start next round" });
    }

    if (game.state !== GameState.RESULTS) {
      return res.status(403).send({ error: "Can only start next round after round results are shown" });
    }

    const newState = game.advanceRound();

    if (newState === GameState.GAME_FINISHED) {
      console.log(`[GAME] Instance ${instanceId} has ended!`);
      generateResultsImage(game.temporaryDirectory(true), game.leaderboard, userDataCache);
      console.log(`[FINAL RESULTS] Instance ${instanceId} final leaderboard:`, JSON.stringify(game.leaderboard.getAll()));
    }

    if (newState === GameState.TRACK_SELECTION) {
      console.log(`[GAME] Instance ${instanceId} has advanced to next round!`);
    }

    triggerUpdate(instanceId);

    res.send({ status: newState });
  });

  router.post("/play-local", authenticateUser, async (req, res) => {
    const { fileName, instanceId } = req.body;
    const userId = req.userId!;

    if (!isAllowed(userId, fileName)) {
      console.warn(`[SECURITY] User ${userId} attempted to play restricted track: ${fileName}`);
      return res.status(403).send({ error: "You do not have permission to play this track." });
    }

    const game = instances[instanceId];

    // Security check: only host can change the music
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can change tracks" });
    }

    const track = allTracks.find((t: Track) => t.audio === fileName);

    if (!track) {
      return res.status(400).send({ error: "Track not found." });
    }

    await game.playTrack(track, () => triggerUpdate(instanceId));

    console.log(`[MUSIC] Instance ${instanceId} started playing ${fileName}`);

    triggerUpdate(instanceId);

    res.send({
      status: GameState.PLAYING,
      track: game.trackInfo
    });
  });

  router.get("/current-track", authenticateUser, async (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const userId = req.userId!;

    const game = instances[instanceId];

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

  router.get("/get-final-results", (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const game = instances[instanceId];

    if (game?.state !== GameState.GAME_FINISHED) {
      return res.status(400).send({ error: "Game has not finished yet." });
    }

    res.send({ leaderboard: game.leaderboard.getAll() || [] });
  });

  router.post("/restart-game", authenticateUser, async (req, res) => {
    const { instanceId } = req.body;
    const userId = req.userId!;

    const game = instances[instanceId];

    // Security check: only host can restart game
    if (!game?.isHost(userId)) {
      return res.status(403).json({ error: "Only host can restart game" });
    }

    game.restart();

    triggerUpdate(instanceId);

    res.send({ success: true });
  });

  router.get("/get-available-jokers", authenticateUser, async (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const userId = req.userId!;

    const game = instances[instanceId];

    if (!game) {
      return res.status(404).send({ error: "Instance not found" });
    }

    // Filter out the ones the user has already used
    const available = [...game.settings.enabledJokers].filter(joker =>
      game.canUseJoker(userId, joker)
    );

    res.send({
      available,
      used: Object.keys(game.usedJokers[userId] || [])
    });
  });

  router.post("/use-joker", authenticateUser, async (req, res) => {
    const { instanceId, jokerType, targetId } = req.body;
    const userId = req.userId!;

    const game = instances[instanceId];

    if (!game) {
      return res.status(400).send({ error: "Instance not found" });
    }

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

  router.post('/post-results-to-channel', async (req, res) => {
    const { instanceId, channelId } = req.body;
    const filePath = path.join(__dirname, `../data/temp/${instanceId}/results.png`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Results image has not been generated yet.' });
    }

    const game = instances[instanceId];
    if (!game) {
      return res.status(400).send({ error: "Instance not found" });
    }
    const winnerMention = `<@${game.lastWinnerId}>`;

    try {
      const formData = new FormData();
      const fileBuffer = fs.readFileSync(filePath);
      const fileBlob = new Blob([fileBuffer], { type: 'image/png' });

      formData.append('files[0]', fileBlob, `results-${instanceId}.png`);
      formData.append('payload_json', JSON.stringify({
        content: `🏁 **The YASQ Game Has Ended!**\n\nCongratulations ${winnerMention}, you are the winner! 🥳\n\nHere are the final results:`,
      }));

      const discordResponse = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
        body: formData
      });

      if (!discordResponse.ok) {
        const logErr = await discordResponse.text();
        throw new Error(`Discord channel message dispatch rejected: ${logErr}`);
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error posting match content artifact downstream:", error);
      return res.status(500).json({ error: 'Internal system operation processing failure.' });
    }
  });

  router.get('/get-channels', async (req, res) => {
    const { guildId } = req.query;

    try {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
        headers: { 'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}` }
      });

      const channels = await response.json() as any[];

      // 1. Create a map of all categories (type 4)
      const categoryMap = new Map();
      channels.filter(c => c.type === 4).forEach(c => categoryMap.set(c.id, c.name));

      // 2. Filter text channels (type 0) and inject the category name
      const textChannels = channels
        .filter((c: any) => c.type === 0)
        .map((c: any) => ({
          id: c.id,
          name: c.name,
          category: c.parent_id ? categoryMap.get(c.parent_id) : ""
        }))
        .sort((a, b) => {
          // Compare categories first
          const categoryCompare = a.category.localeCompare(b.category);
          if (categoryCompare !== 0) return categoryCompare;

          // If categories are the same, compare channel names
          return a.name.localeCompare(b.name);
        });
      res.json(textChannels);
    } catch (err) {
      res.status(500).json({ error: 'Could not fetch channels' });
    }
  });

  return router;
};