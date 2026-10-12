import MersenneTwister from 'mersenne-twister';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import fsAsync from 'fs/promises';
import { fileURLToPath } from 'url';
import { clearTimeout } from 'node:timers';

import {
  AchievementBonusType,
  BASE_POINTS,
  BonusType,
  EXPONENTIAL_DECAY_INTENSITY,
  GAME_COVERS_DIR,
  GamePhase,
  GameSettings,
  GLIMPSE_BLUR_INTENSITY,
  Joker,
  MAX_TIME_MULTIPLIER,
  MIN_TIME_MULTIPLIER,
  type Playback,
  type PlayerTimeBonusPoint,
  PointsBonus,
  RoundTimings,
  STATIC_FILES_DIR,
  type Tag,
  TEMP_FILES_DIR,
  TimeBonus,
  type TimeBonusPoint,
  type TimeBonusSummary,
  type Track,
  TRACK_AUDIO_DIR,
  type TrackInfo,
} from '@yasq/shared';

import { getCachedDisplayName, getFilePath, hash } from '../helper.js';
import { LogCategory, logger } from '../utils/logger.js';
import { Leaderboard, LeaderboardEntry, RoundResult, RoundSummary } from './leaderboard.js';
import { GameStats } from './game_stats.js';
import { saveLeaderboard } from '../db.js';
import { ACHIEVEMENT_BONUS_RULES, AchievementBonusManager, AchievementBonusMetric } from './achievement_bonus.js';

type UserId = string;

export class GameInstance {
  public instanceId: string;
  public registeredUsers: Set<UserId> = new Set();
  public clientLatencies: Map<UserId, number> = new Map();
  public hostId: UserId | null;
  public state: GameState = new GameState();
  public readyPlayers: Set<UserId> = new Set();
  public readyClients: Set<UserId> = new Set();
  public guessedPlayers: Set<UserId> = new Set();
  public settings: GameSettings<Set<Joker>> = GameSettings.withJokerSet();
  public trackInfo: TrackInfo | null = null;
  public guesses: Record<number, Record<UserId, UserGuess>> = {};
  public leaderboard: Leaderboard = new Leaderboard();
  public trackHistory: string[] = [];
  public lastWinnerId: UserId | null = null;
  public usedJokers: Record<UserId, Partial<Record<Joker, number>>> = {};
  public streaks: Record<UserId, number> = {};
  public currentRoundLostStreaks: Record<UserId, number> = {};
  public gameStats: GameStats = new GameStats();
  public achievementBonusManager: AchievementBonusManager = new AchievementBonusManager(ACHIEVEMENT_BONUS_RULES);
  public activeAchievementBonuses: AchievementBonusType[] = [];

  public onUpdate?: (game: GameInstance) => void;

  private roundStartTimeout: NodeJS.Timeout | undefined;
  private roundEndTimeout: NodeJS.Timeout | undefined;

  constructor(instanceId: string, hostId: UserId) {
    this.instanceId = instanceId;
    this.hostId = hostId;
  }

  public isHost(userId: UserId): boolean {
    return this.hostId === userId;
  }

  public addUser(userId: UserId) {
    this.registeredUsers.add(userId);

    if (!this.clientLatencies.has(userId)) {
      this.clientLatencies.set(userId, 0);
    }
  }

  public removeUser(userId: UserId) {
    this.registeredUsers.delete(userId);
    this.clientLatencies.delete(userId);
  }

  public setupGame(settings: GameSettings<Iterable<Joker>>): void {
    this.settings = {
      ...settings,
      maxGuessTime: settings.maxGuessTime * 1000,
      enabledJokers: new Set(settings.enabledJokers),
    };
    this.state.phase = GamePhase.LOBBY;
    this.removeTempFiles();
  }

  public startGame(): void {
    this.readyPlayers = new Set<UserId>();
    this.readyClients = new Set<UserId>();
    this.registeredUsers.forEach(userId => {
      if (this.isHost(userId)) return; // Skip host
      if (!this.leaderboard.hasEntry(userId)) {
        this.leaderboard.addEntry(new LeaderboardEntry(userId));
      }
    });
    this.state.phase = GamePhase.TRACK_SELECTION;
    this.state.round = 1;
    this.gameStats.startTime = Date.now();
    this.resolveActiveAchievementBonuses();
  }

  private resolveActiveAchievementBonuses(): void {
    const allTypes = Object.values(AchievementBonusType);
    const achSettings = this.settings.achievementBonuses;

    if (achSettings?.mode === 'manual') {
      this.activeAchievementBonuses = achSettings.enabledTypes ?? [];
    } else if (achSettings?.mode === 'random') {
      const shuffled = [...allTypes].sort(() => Math.random() - 0.5);
      this.activeAchievementBonuses = shuffled.slice(0, achSettings.randomCount);
    } else {
      // 'off' (or unconfigured/default)
      this.activeAchievementBonuses = [];
    }
  }

  public submitGuess(userId: UserId, guessText: string): { current: number; total: number } {
    this.guesses[this.state.round] ??= {};

    const timeTaken = this.state.playback
      ? Math.min(Date.now() - this.state.playback.startTime, this.settings.maxGuessTime)
      : this.settings.maxGuessTime;

    this.guesses[this.state.round]![userId] = new UserGuess(guessText, timeTaken);
    const totalPlayers = Array.from(this.registeredUsers).filter(userId => !this.isHost(userId)).length;
    const guessersCount = Object.keys(this.guesses[this.state.round] ?? {}).length;

    if (guessersCount >= totalPlayers) {
      this.state.phase = GamePhase.HOST_REVIEW;
      this.removeTempFiles();
    }

    this.guessedPlayers.add(userId);

    return { current: guessersCount, total: totalPlayers };
  }

  public getTimedOutPlayers(): UserId[] {
    const currentGuesses = this.guesses[this.state.round] || {};

    // Convert Set to Array to use filter
    return Array.from(this.registeredUsers).filter(userId => !currentGuesses[userId] && !this.isHost(userId));
  }

  public submitResults(corrections: Record<UserId, number>): void {
    const roundGuesses = this.guesses[this.state.round] || {};

    // Assign a score value to each guess with respect to the host's corrections
    Object.entries(corrections).forEach(([userId, scoreValue]) => {
      const userGuess = roundGuesses[userId];
      if (userGuess) {
        userGuess.scoreValue = Number(scoreValue);
      }
    });

    // Identify the fastest correct guess for this round
    let fastestFullyCorrectUserId = '';
    let firstFullyCorrectTime = Infinity;
    let firstPartiallyCorrectTime = Infinity;
    Object.entries(roundGuesses).forEach(([userId, data]) => {
      if (data.scoreValue === 1 && data.timeTaken < firstFullyCorrectTime) {
        firstFullyCorrectTime = data.timeTaken;
        fastestFullyCorrectUserId = userId;
      }
      if (data.scoreValue > 0 && data.timeTaken < firstPartiallyCorrectTime) {
        firstPartiallyCorrectTime = data.timeTaken;
      }
    });

    // Calculate lost streaks
    this.currentRoundLostStreaks = this.calculateLostStreaks();
    const totalLostStreaks = Object.values(this.currentRoundLostStreaks).reduce((sum, streak) => sum + streak, 0);
    const streakBreakerMultiplier = totalLostStreaks * this.settings.streakBonusMultiplier;

    const roundSummary = new RoundSummary(this.state.round);
    roundSummary.timeBonusSummary = this.calculateTimeBonusSummary(firstPartiallyCorrectTime);

    this.leaderboard.addSummary(roundSummary);

    // Calculate bonus points and add a RoundResult for every registered user
    this.registeredUsers.forEach(userId => {
      if (this.isHost(userId)) return; // Skip host

      const data = roundGuesses[userId];
      const scoreMultiplier = data?.scoreValue || 0;
      this.updateStreak(userId, scoreMultiplier);

      const isFirst = userId === fastestFullyCorrectUserId;
      const playerBasePoints = BASE_POINTS * scoreMultiplier;
      let pointsEarned = Math.round(playerBasePoints);
      const awardedBonuses: PointsBonus[] = [];

      if (scoreMultiplier > 0) {
        if (roundSummary.timeBonusSummary !== null) {
          const timeBonusMultiplier =
            roundSummary.timeBonusSummary.playerGuessTimes.find(bonus => bonus.playerId === userId)?.multiplier ?? 0.0;

          if (timeBonusMultiplier > 0) {
            awardedBonuses.push(new PointsBonus(BonusType.TIME_BONUS, timeBonusMultiplier));
          }
        }

        if (isFirst && this.settings.firstBonusMultiplier > 0) {
          awardedBonuses.push(new PointsBonus(BonusType.FIRST_BONUS, this.settings.firstBonusMultiplier));
        }

        const currentStreak = this.streaks[userId] || 0;
        if (currentStreak > 1 && this.settings.streakBonusMultiplier > 0) {
          const streakMultiplier = (currentStreak - 1) * this.settings.streakBonusMultiplier;
          awardedBonuses.push(new PointsBonus(BonusType.STREAK_BONUS, streakMultiplier));
        }

        if (scoreMultiplier === 1 && streakBreakerMultiplier > 0) {
          awardedBonuses.push(new PointsBonus(BonusType.STREAK_BREAKER, streakBreakerMultiplier));
        }

        // Apply collected bonuses
        for (const bonus of awardedBonuses) {
          pointsEarned += bonus.toAbsolute(playerBasePoints);
        }
      }

      // Find the user's existing entry and add this round
      const entry = this.leaderboard.getOrCreate(userId);
      entry.addRound(
        new RoundResult(
          this.state.round,
          data?.text || 'No Guess Submitted',
          pointsEarned,
          data?.scoreValue || 0.0,
          isFirst,
          data ? data.timeTaken / 1000 : this.settings.maxGuessTime / 1000,
          awardedBonuses
        )
      );
    });

    this.state.phase = GamePhase.ROUND_RESULTS;
    this.guessedPlayers = new Set();

    if (this.trackInfo !== null) {
      const roundResults = this.leaderboard.getRoundResults(this.state.round);
      this.gameStats.updateBestScoringRound(roundResults, this.trackInfo.track);
      this.gameStats.updateLeastScoringRound(roundResults, this.trackInfo.track);
      this.achievementBonusManager.processRound(roundResults, this.trackInfo.track);
    }
  }

  public updateStreak(userId: UserId, scoreMultiplier: number) {
    if (this.streaks[userId] === undefined) {
      this.streaks[userId] = 0;
    }

    if (scoreMultiplier === 1) {
      this.streaks[userId] += 1;
    } else if (scoreMultiplier === 0) {
      this.streaks[userId] = 0;
    }

    this.achievementBonusManager.updateMetric(
      userId,
      AchievementBonusMetric.STREAK,
      this.streaks[userId],
      (current, incoming) => incoming > current
    );
  }

  public calculateLostStreaks(): Record<UserId, number> {
    const roundGuesses = this.guesses[this.state.round] || {};
    const lostStreaks: Record<string, number> = {};

    this.registeredUsers.forEach(userId => {
      if (this.isHost(userId)) return;

      const data = roundGuesses[userId];
      const scoreMultiplier = data?.scoreValue || 0;
      const currentStreak = this.streaks[userId] || 0;

      // If they had a streak of 2 or higher but failed this round (scoreMultiplier === 0)
      if (scoreMultiplier === 0 && currentStreak >= 2) {
        lostStreaks[userId] = currentStreak;
      }
    });

    return lostStreaks;
  }

  public calculateTimeBonusSummary(firstPartiallyCorrectTime: number): TimeBonusSummary | null {
    if (this.settings.timeBonus == null) return null;

    const roundGuesses = this.guesses[this.state.round] || {};

    // Precompute a fixed number of points of the time bonus function
    const samples = 200; // number of evenly spaced samples to calculate to draw the time bonus curve
    const curvePoints: TimeBonusPoint[] = [];
    for (let i = 0; i <= samples; i++) {
      const time = (i / samples) * this.settings.maxGuessTime;
      const multiplier = this.calculateTimeMultiplier(time, firstPartiallyCorrectTime);
      curvePoints.push({ time: time, multiplier: multiplier });
    }

    const playerTimePoints: PlayerTimeBonusPoint[] = [...this.registeredUsers.values()]
      .filter(userId => !this.isHost(userId))
      .map(userId => {
        const scoreValue = roundGuesses[userId]?.scoreValue || 0.0;
        const timeTaken = roundGuesses[userId]?.timeTaken || this.settings.maxGuessTime;
        const timeBonusMultiplier =
          scoreValue > 0 ? this.calculateTimeMultiplier(timeTaken, firstPartiallyCorrectTime) : null;

        return {
          playerId: userId,
          time: timeTaken,
          multiplier: timeBonusMultiplier,
          fullyCorrect: scoreValue === 1.0,
        } as PlayerTimeBonusPoint;
      });

    return {
      totalTime: this.settings.maxGuessTime,
      curvePoints: curvePoints,
      playerGuessTimes: playerTimePoints,
    };
  }

  public calculateTimeMultiplier(evaluationTime: number, firstSuccessTime: number): number {
    if (this.settings.timeBonus === null) return 0.0; // apply no time bonus

    const totalTime = this.settings.maxGuessTime;

    // Stay constant at MAX until the first successful answer
    if (evaluationTime <= firstSuccessTime || evaluationTime <= 0) {
      return MAX_TIME_MULTIPLIER;
    }
    // Stay constant at MIN from the end of the round
    if (evaluationTime >= totalTime || totalTime <= firstSuccessTime) {
      return MIN_TIME_MULTIPLIER;
    }

    const timeMultiplierFunction: TimeMultiplierFunction = TIME_MULTIPLIERS[this.settings.timeBonus];
    const bonusFraction = timeMultiplierFunction(evaluationTime, firstSuccessTime, totalTime);

    const multiplier = MIN_TIME_MULTIPLIER + (MAX_TIME_MULTIPLIER - MIN_TIME_MULTIPLIER) * bonusFraction;

    return Math.min(MAX_TIME_MULTIPLIER, Math.max(MIN_TIME_MULTIPLIER, multiplier));
  }

  public advanceRound(): GameState {
    this.readyPlayers.clear();
    this.readyClients.clear();
    this.currentRoundLostStreaks = {};
    this.state.playback = null;
    this.trackInfo = null;

    if (this.state.round >= this.settings.rounds) {
      this.state.phase = GamePhase.FINAL_RESULTS;
      this.applyAchievementBonuses();
      this.leaderboard.sort();
      this.lastWinnerId = this.leaderboard.getWinnerId();
      this.gameStats.endTime = Date.now();
      saveLeaderboard(this.leaderboard);
    } else {
      this.state.phase = GamePhase.TRACK_SELECTION;
      this.state.round += 1;
    }

    return this.state;
  }

  public async selectNextTrack(track: Track): Promise<void> {
    this.trackInfo = {
      url: `/${TRACK_AUDIO_DIR}/${track.audio}`,
      track,
      gameCoverUrl: `/${GAME_COVERS_DIR}/${track.cover}`,
    };
    this.state.phase = GamePhase.PLAYING;
    this.trackHistory.push(track.audio);

    // Generate the blurred cover art on the server once at the beginning of the round if needed
    if (track.cover && this.settings.enabledJokers.has(Joker.GLIMPSE)) {
      await this.generateBlurredImage(track.cover);
    }

    clearTimeout(this.roundEndTimeout);
  }

  public playNextTrack(startTime: number) {
    if (!this.trackInfo) {
      logger.error(`Tried to run playNextTrack without selecting a track first.`, LogCategory.GAME, this.instanceId);
      return;
    }

    const endTime = startTime + this.settings.maxGuessTime;

    this.state.playback = {
      game: this.state.game,
      round: this.state.round,
      startTime,
      endTime,
    } satisfies Playback;

    const startInMs = startTime - Date.now();
    const endInMs = endTime - Date.now();

    logger.debug(
      `Round ${this.state.round} scheduled: Starting in ${startInMs}ms, ending in ${endInMs}ms`,
      LogCategory.GAME,
      this.instanceId
    );

    // Set a timer to automatically transition to HOST_REVIEW after maxGuessTime
    clearTimeout(this.roundEndTimeout);
    this.roundEndTimeout = setTimeout(() => {
      const playback = this.state.playback;
      if (!playback) return;

      if (
        this.state.phase === GamePhase.PLAYING &&
        this.state.round === playback.round &&
        this.state.game === playback.game
      ) {
        logger.debug(`Timer for round ${this.state.round} expired`, LogCategory.GAME, this.instanceId);
        this.state.phase = GamePhase.HOST_REVIEW;
        this.notifyUpdate();
        this.removeTempFiles();
      }
    }, endInMs);
  }

  public updateClientReadyStatus(userId: UserId, isReady: boolean, setupDurationMillis: number) {
    const estimatedTimePassed = setupDurationMillis + (this.clientLatencies.get(userId) ?? 0);
    const { COUNTDOWN_DURATION, MIN_ROUND_START_DELAY, MAX_ROUND_START_DELAY, MAX_LATENCY_DELAY, SAFETY_TOLERANCE } =
      RoundTimings;

    // Calculate a fitting start/end time for the upcoming round and notify clients about this
    const scheduleRoundStart = (artificialDelay: number = 0) => {
      clearTimeout(this.roundStartTimeout);

      if (this.state.playback !== null || !this.trackInfo) return;

      // Respect reasonable client latencies and requested artificial delay
      const maxClientLatency = Math.min(MAX_LATENCY_DELAY, Math.max(...this.clientLatencies.values()));
      const minimumWaitingTime = Math.max(artificialDelay - SAFETY_TOLERANCE, maxClientLatency);

      const startTime = Date.now() + COUNTDOWN_DURATION + minimumWaitingTime + SAFETY_TOLERANCE;

      this.playNextTrack(startTime);
      this.notifyUpdate();
    };

    if (isReady) {
      // Start a fallback timeout once the first client is ready to automatically start the round after some maximum waiting time
      if (this.readyClients.size === 0 && !this.roundStartTimeout) {
        setTimeout(() => {
          logger.debug(`Round start forced after ${MAX_ROUND_START_DELAY}ms`, LogCategory.GAME, this.instanceId);
          scheduleRoundStart();
        }, MAX_ROUND_START_DELAY - estimatedTimePassed);
      }

      this.readyClients.add(userId);
    } else {
      this.readyClients.delete(userId);
    }

    logger.debug(
      `User '${getCachedDisplayName(userId)}' is ${isReady ? 'READY' : 'NOT READY'} to play (setupDuration: ${Math.round(setupDurationMillis * 100) / 100}ms)`,
      LogCategory.GAME,
      this.instanceId
    );

    // Everyone is ready -> initiate round start
    if (this.readyClients.size >= this.registeredUsers.size) {
      // Let clients wait at least MIN_ROUND_START_DELAY in total before the countdown starts
      const minimumWaitingTime = Math.max(0, MIN_ROUND_START_DELAY - estimatedTimePassed);
      scheduleRoundStart(minimumWaitingTime);
    }

    return { pendingClientsNumber: this.registeredUsers.size - this.readyClients.size };
  }

  public restart() {
    this.state.phase = GamePhase.SETUP;
    this.state.round = 0;
    this.readyPlayers = new Set<UserId>();
    this.readyClients = new Set<UserId>();
    this.guesses = {};
    this.trackInfo = null;
    this.trackHistory = [];
    this.leaderboard = new Leaderboard();
    this.state.game += 1;
    this.usedJokers = {};
    this.streaks = {};
    this.gameStats = new GameStats();
    this.activeAchievementBonuses = [];
  }

  public canUseJoker(userId: UserId, jokerType: Joker): boolean {
    if (!this.usedJokers[userId]) {
      this.usedJokers[userId] = {};
    }

    // Check if joker was used in the past
    if (jokerType in this.usedJokers[userId]) return false;

    // Check if any joker has already been used in this round
    return !Object.values(this.usedJokers[userId]).includes(this.state.round);
  }

  public getPartialHint(revealPercent: number = 0.2): string {
    const title = this.trackInfo?.track.game;
    if (!title) return '';

    const seed: number = this.hashWithGameState(title);
    const generator = new MersenneTwister(seed);

    return title
      .split('')
      .map(c => {
        // Keep special characters
        if (!/[a-zA-Z0-9]/.test(c)) return c;

        // Obfuscate the rest but keep a few characters
        return generator.random() < revealPercent ? c : '_';
      })
      .join('');
  }

  private hashWithGameState(str: string): number {
    return hash(`${this.instanceId}-${this.state.game}-${this.state.round}-${str}`);
  }

  public getTagHint(): Tag[] {
    return this.trackInfo?.track.tags || [];
  }

  public getMultipleChoiceHint(tracks: Track[]): string[] {
    const correctAnswer = this.trackInfo?.track.game;
    if (!correctAnswer) return [];

    // Get all unique game titles except the correct one
    const otherTitles = Array.from(new Set(tracks.map(t => t.game).filter(title => title !== correctAnswer)));

    const seed: number = this.hashWithGameState(correctAnswer);
    const generator = new MersenneTwister(seed);

    // Randomly pick 3 wrong answers
    // We sort by a random value and take the first 3
    const wrongAnswers = otherTitles.sort(() => 0.5 - generator.random()).slice(0, 3);

    // Combine with the correct answer and shuffle the final 4
    const finalChoices = [correctAnswer, ...wrongAnswers];

    return finalChoices.sort(() => 0.5 - generator.random());
  }

  public getSpyHint(userId: UserId): string | null {
    return this.guesses[this.state.round]?.[userId]?.text ?? null;
  }

  public async getGlimpseHint(): Promise<string | null> {
    const tempDir = this.temporaryDirectory();
    const imagePath = path.join(tempDir, `glimpse_${this.state.round}.jpg`);

    if (!fs.existsSync(imagePath)) return null;

    const glimpseBase64 = await fsAsync.readFile(imagePath, {
      encoding: 'base64',
    });

    return `data:image/jpeg;base64,${glimpseBase64}`;
  }

  public temporaryDirectory(createIfAbsent: boolean = false): string {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const instanceTempDir = path.join(__dirname, '..', '..', STATIC_FILES_DIR, TEMP_FILES_DIR, this.instanceId);

    if (createIfAbsent && !fs.existsSync(instanceTempDir)) {
      fs.mkdirSync(instanceTempDir, {
        recursive: true,
      });
    }

    return instanceTempDir;
  }

  private async generateBlurredImage(coverImageFile: string) {
    const outputDir = this.temporaryDirectory(true);

    try {
      const outputPath = path.join(outputDir, `glimpse_${this.state.round}.jpg`);

      await sharp(path.join(getFilePath(GAME_COVERS_DIR), coverImageFile))
        .resize(500)
        .blur(GLIMPSE_BLUR_INTENSITY)
        .jpeg()
        .toFile(outputPath);
    } catch (err: unknown) {
      logger.error(
        `Failed to generate Glimpse image from source '${coverImageFile}'`,
        LogCategory.GAME,
        this.instanceId,
        err as Error
      );
    }
  }

  private removeTempFiles() {
    const tempDir = this.temporaryDirectory();
    fs.rmSync(tempDir, {
      recursive: true,
      force: true,
    });
  }

  public markJokerUsed(userId: UserId, joker: Joker): void {
    if (!this.usedJokers[userId]) {
      this.usedJokers[userId] = {};
    }

    this.usedJokers[userId][joker] = this.state.round;
  }

  public pickNewHost(): boolean {
    const remainingPlayers = Array.from(this.registeredUsers);

    if (remainingPlayers.length === 0) {
      return false;
    }

    this.hostId = remainingPlayers[0] ?? null;
    return true;
  }

  private applyAchievementBonuses(): void {
    // Loop through all active achievements
    for (const [ruleId, state] of this.achievementBonusManager.achievements.entries()) {
      // Check if this achievement type is active/enabled for this game
      if (!this.activeAchievementBonuses.includes(ruleId as AchievementBonusType)) {
        continue;
      }

      // Apply the bonus and its configured reward to all users who hold or share the record
      if (state.userIds && state.userIds.length > 0) {
        const reward = state.rule.reward ?? 0;

        for (const userId of state.userIds) {
          const entry = this.leaderboard.getOrCreate(userId);
          entry.addAchievementBonus(ruleId as AchievementBonusType, reward);
        }
      }
    }
  }

  public notifyUpdate(): void {
    this.onUpdate?.(this);
  }

  public dispose(): void {
    clearTimeout(this.roundStartTimeout);
    clearTimeout(this.roundEndTimeout);
    this.removeTempFiles();
  }

  toJSON() {
    return {
      ...this,
      // Convert Sets to Arrays (Sets serialize to {})
      registeredUsers: Array.from(this.registeredUsers),
      readyPlayers: Array.from(this.readyPlayers),
      readyClients: Array.from(this.readyClients),
      guessedPlayers: Array.from(this.guessedPlayers),
    };
  }
}

class GameState {
  public game: number = 1;
  public round: number = 0;
  public phase: GamePhase = GamePhase.SETUP;
  public playback: Playback | null = null;
}

/**
 * Mathematical function representing the time bonus decay over time. In particular, this function computes a time bonus
 * multiplier at a given evaluation time based on the time of the first successful player and the maximum possible guess time.<br/>
 * The function must return a **bonus factor** in the range `[0.0, 1.0]`, indicating
 * how much of the maximum time bonus remains at the given evaluationTime.
 * @param evaluationTime - Time at which the multiplier shall be calculated.
 * @param firstSuccessTime - Time when the first player answered partially correctly.
 * @param totalTime - Latest possible guess time as per the game settings.
 * @returns bonusFraction - Fraction of the time bonus at evaluationTime.
 */
type TimeMultiplierFunction = (evaluationTime: number, firstSuccessTime: number, totalTime: number) => number;

const TIME_MULTIPLIERS: Record<TimeBonus, TimeMultiplierFunction> = {
  /** Linear function passing through (first, MAX) and (total, MIN) */
  [TimeBonus.LINEAR]: (elapsed, first, total) => {
    // Scale elapsed time between 'first' and 'total' to a normalized range of [0, 1]
    const decayFraction = (elapsed - first) / (total - first);
    return 1 - decayFraction;
  },

  /**
   * Exponential decay function passing through (first, MAX) and (total, MIN) decaying with rate
   * e^({@link EXPONENTIAL_DECAY_INTENSITY} * elapsed)
   */
  [TimeBonus.EXPONENTIAL]: (elapsed, first, total) => {
    const k = EXPONENTIAL_DECAY_INTENSITY; // larger values mean faster decay

    // Scale elapsed time between 'first' and 'total' to a normalized range of [0, 1]
    const x = (elapsed - first) / (total - first);

    // Shift function to match 1 at x=0 and 0 at x=1
    // f(x) = (1/e^(k * x) - 1/e^k) / (1 - 1/e^k)
    return (Math.exp(-k * x) - Math.exp(-k)) / (1 - Math.exp(-k));
  },

  /**
   * Logistic decay centered around 50% of the multiplier at 50% of the total time.
   */
  [TimeBonus.LOGISTIC]: (elapsed, first, total) => {
    // Scale elapsed time between 'first' and 'total' to a normalized range of [-0.5, 0.5]
    const x = (elapsed - first) / (total - first) - 0.5;

    // Logistic decay passing through (0, 0.5) with f(-0.5) ~= 1 and f(0.5) ~= 0
    const height: number = 1.01;
    const k: number = 11;
    return 1.005 - height / (1 + Math.exp(-k * x));
  },
};

export class UserGuess {
  constructor(
    public text: string,
    public timeTaken: number,
    public scoreValue: number = 0
  ) {}
}
