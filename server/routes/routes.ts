import express from 'express';
import { GameInstance, Track } from '../src/models.js';
import type { InstanceQuery, InstanceUserQuery } from '../src/types.js';
import { COUNTDOWN_DURATION, GameState, INT32_MAX_VALUE, Joker } from '@yasq/shared';
import { invalidateToken, validateToken } from '../src/helper.js';
import { isAllowed } from '../src/access_control.js';

export const setupRoutes = (instances: Record<string, GameInstance>, isMockMode: boolean, allTracks: any, allPlaylists: any) => {
  const router = express.Router();

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

  router.post("/register", async (req, res) => {
    const { instanceId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

    if (!instanceId) {
      return res.status(400).send({ error: "Missing data" });
    }

    // If no one has registered for this instance yet, this user is the host
    if (!instances[instanceId]) {
      instances[instanceId] = new GameInstance(instanceId, userId);
      console.log(`[HOST ASSIGNED] ${userId} is the host of new instance ${instanceId}`);
    }

    const game = instances[instanceId];
    game.registeredUsers.add(userId);

    res.send({
      isHost: game.isHost(userId),
      hostId: game.hostId
    });
  });

  router.post("/deregister", async (req, res) => {
    const { instanceId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

    const game = instances[instanceId];

    if (!game) {
      return res.status(400).send({ error: "Instance not found" });
    }

    game.registeredUsers.delete(userId);
    invalidateToken(token);

    if (game.isHost(userId)) {
      const isGameActive = game.pickNewHost();

      if (!isGameActive) {
        console.log(`Terminating empty instance: ${instanceId}`);
        delete instances[instanceId];
        return res.send({ message: "Instance terminated" });
      }
    }

    res.send({
      success: true,
      hostId: game.hostId
    });
  });

  router.post("/ready", async (req, res) => {
    const { instanceId, ready } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

    const game = instances[instanceId];

    if (!game) {
      return res.status(400).send({ error: "Instance not found" });
    }

    if (ready) {
      game.readyUsers.add(userId);
    } else {
      game.readyUsers.delete(userId);
    }

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

    res.send({
      readyUsers: [...game.readyUsers]
    });
  });

  router.post("/assign-host", async (req, res) => {
    const { instanceId, newHostId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

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
    res.send({ status: "success" });
  });

  router.post("/setup-game", async (req, res) => {
    const { instanceId, rounds, trackDuration, enabledJokers } = req.body;
    const authHeader = req.headers.authorization;
    const maxAllowedDuration: number = Math.floor(INT32_MAX_VALUE / 1000) - COUNTDOWN_DURATION;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

    const game = instances[instanceId];

    // Security check: only host can setup a game
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can setup a game" });
    }

    if (rounds <= 0 || trackDuration <= 0) {
      return res.status(400).send({ error: "Rounds and track duration must be greater than 0." });
    }
    if (trackDuration > maxAllowedDuration) {
      return res.status(400).send({ error: `Rounds and track duration must not exceed ${maxAllowedDuration}.` });
    }

    game.setupGame(rounds, trackDuration, enabledJokers);
    console.log(`[GAME] Instance ${instanceId} has been set up with settings: rounds: ${game.settings.rounds}, trackDuration: ${game.settings.trackDuration}, enabledJokers: ${[...game.settings.enabledJokers]}!`);
    res.send({ status: GameState.LOBBY });
  });

  router.post("/start-game", async (req, res) => {
    const { instanceId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

    const game = instances[instanceId];

    // Security check: only host can start a game
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can start a game" });
    }

    game.startGame();
    console.log(`[GAME] Instance ${instanceId} has started!`);
    res.send({ status: GameState.TRACK_SELECTION });
  });

  router.get("/game-status", (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const game = instances[instanceId];

    if (!game) {
      return res.status(400).send({ error: "Instance not found" });
    }

    res.send({
      state: game.state,
      hostId: game.hostId,
      readyUsers: [...game.readyUsers],
      guessedPlayers: [...game.guessedPlayers],
      currentRound: game.currentRound,
      isFinalRound: game.isFinalRound(),
      currentGame: game.currentGame,
      lastWinnerId: game.lastWinnerId,
      rounds: game.settings.rounds,
      trackDuration: game.settings.trackDuration,
      enabledJokers: [...game.settings.enabledJokers]
    });
  });

  router.get("/track-list", async (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

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

  router.post("/submit-guess", async (req, res) => {
    const { instanceId, guess } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

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

    res.send({ status: "submitted" });
  });

  router.get("/get-guesses", async (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

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

  router.post("/submit-round-results", async (req, res) => {
    const { instanceId, corrections } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

    const game = instances[instanceId];

    // Security check: only host can submit round results
    if (!game?.isHost(userId)) {
      return res.status(403).send({ error: "Only host can submit round results" });
    }

    console.log(`[RESULTS] Host submitted corrections for instance ${instanceId}:`, corrections);
    game.submitResults(corrections);

    console.log(`[RESULTS] Results calculated for instance ${instanceId}: ${JSON.stringify(game.leaderboard.getRoundResults(game.currentRound))}.`);
    res.send({ status: "success" });
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
      correctPlayers: correctPlayersCount
    });
  });

  router.post("/start-next-round", async (req, res) => {
    const { instanceId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

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
      console.log(`[FINAL RESULTS] Instance ${instanceId} final leaderboard:`, JSON.stringify(game.leaderboard.getAll()));
    }

    if (newState === GameState.TRACK_SELECTION) {
      console.log(`[GAME] Instance ${instanceId} has advanced to next round!`);
    }

    res.send({ status: newState });
  });

  router.post("/play-local", async (req, res) => {
    const { fileName, instanceId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

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

    game.playTrack(track);

    console.log(`[MUSIC] Instance ${instanceId} started playing ${fileName}`);
    res.send({
      status: "playing",
      track: game.trackInfo
    });
  });

  router.get("/current-track", async (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

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

  router.post("/restart-game", async (req, res) => {
    const { instanceId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

    const game = instances[instanceId];

    // Security check: only host can restart game
    if (!game?.isHost(userId)) {
      return res.status(403).json({ error: "Only host can restart game" });
    }

    game.restart();

    res.send({ success: true });
  });

  router.get("/get-available-jokers", async (req, res) => {
    const { instanceId } = req.query as InstanceQuery;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

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

  router.post("/use-joker", async (req, res) => {
    const { instanceId, jokerType, targetId } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) return res.status(401).send({ error: "No token provided" });
    const token = authHeader.split(' ')[1] || "";

    const userId = await validateToken(token);

    if (!userId) {
      return res.status(401).send({ error: "Invalid Discord token" });
    }

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
          return res.status(202).send({ error: "Target hasn't submitted yet. Joker not consumed." });
        }
        break;
      default:
        return res.status(400).send({ error: "Invalid joker type" });
    }

    game.markJokerUsed(userId, jokerType);

    res.send({
      jokerType,
      hint
    });
  });

  return router;
};