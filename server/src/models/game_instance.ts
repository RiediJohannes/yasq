import {
  AchievementBonusType,
  BASE_POINTS,
  BonusType,
  COUNTDOWN_DURATION,
  EXPONENTIAL_DECAY_INTENSITY,
  GameSettings,
  GameState,
  GLIMPSE_BLUR_INTENSITY,
  Joker,
  MAX_TIME_MULTIPLIER,
  MIN_TIME_MULTIPLIER,
  type PlayerTimeBonusPoint,
  PointsBonus,
  STATIC_FILES_DIR,
  type Tag,
  TEMP_FILES_DIR,
  TimeBonus,
  type TimeBonusPoint,
  type TimeBonusSummary,
  type Track,
  type TrackInfo,
} from '@yasq/shared';
import MersenneTwister from 'mersenne-twister';
import { getFilePath, hash } from '../helper.js';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import fsAsync from 'fs/promises';
import { LogCategory, logger } from '../utils/logger.js';
import { fileURLToPath } from 'url';
import { Leaderboard, LeaderboardEntry, RoundResult, RoundSummary } from './leaderboard.js';
import { GameStats } from './game_stats.js';

export class GameInstance {
  public instanceId: string;
  public registeredUsers: Set<string> = new Set();
  public hostId: string | null;
  public state: string = GameState.SETUP;
  public currentRound: number = 0;
  public readyUsers: Set<string> = new Set();
  public guessedPlayers: Set<string> = new Set();
  public settings: GameSettings<Set<Joker>> = GameSettings.withJokerSet();
  public trackInfo: TrackInfo | null = null;
  public guesses: Record<number, Record<string, UserGuess>> = {};
  public leaderboard: Leaderboard = new Leaderboard();
  public currentGame: number = 1;
  public trackHistory: string[] = [];
  public lastWinnerId: string | null = null;
  public usedJokers: Record<string, Partial<Record<Joker, number>>> = {};
  public streaks: Record<string, number> = {};
  public currentRoundLostStreaks: Record<string, number> = {};
  public gameStats: GameStats = new GameStats();
  public activeAchievementBonuses: AchievementBonusType[] = [];

  public onUpdate?: (game: GameInstance) => void;

  private roundTimeout: NodeJS.Timeout | null = null;

  constructor(instanceId: string, hostId: string) {
    this.instanceId = instanceId;
    this.hostId = hostId;
  }

  public isHost(userId: string): boolean {
    return this.hostId === userId;
  }

  public getNumberOfParticipants(): number {
    return this.registeredUsers.size;
  }

  public setupGame(settings: GameSettings<Set<Joker>>): void {
    this.settings = {
      ...settings,
      maxGuessTime: settings.maxGuessTime * 1000,
      enabledJokers: new Set(settings.enabledJokers),
    };
    this.state = GameState.LOBBY;
    this.removeTempFiles();
  }

  public startGame(): void {
    this.readyUsers = new Set();
    this.registeredUsers.forEach(userId => {
      if (this.isHost(userId)) return; // Skip host
      if (!this.leaderboard.hasEntry(userId)) {
        this.leaderboard.addEntry(new LeaderboardEntry(userId));
      }
    });
    this.state = GameState.TRACK_SELECTION;
    this.currentRound = 1;
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

  public submitGuess(userId: string, guessText: string): { current: number; total: number } {
    if (!this.guesses[this.currentRound]) {
      this.guesses[this.currentRound] = {};
    }

    const timeTaken = this.trackInfo ? Date.now() - this.trackInfo.startTime : this.settings.maxGuessTime;

    this.guesses[this.currentRound]![userId] = new UserGuess(guessText, timeTaken);
    const totalPlayers = Array.from(this.registeredUsers).filter(userId => !this.isHost(userId)).length;
    const guessersCount = Object.keys(this.guesses[this.currentRound] ?? {}).length;

    if (guessersCount >= totalPlayers) {
      this.state = GameState.HOST_REVIEW;
      this.removeTempFiles();
    }

    this.guessedPlayers.add(userId);

    return { current: guessersCount, total: totalPlayers };
  }

  public getTimedOutPlayers(): string[] {
    const currentGuesses = this.guesses[this.currentRound] || {};

    // Convert Set to Array to use filter
    return Array.from(this.registeredUsers).filter(userId => !currentGuesses[userId] && !this.isHost(userId));
  }

  public submitResults(corrections: Record<string, number>): void {
    const roundGuesses = this.guesses[this.currentRound] || {};

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

    const roundSummary = new RoundSummary(this.currentRound);
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
          this.currentRound,
          data?.text || 'No Guess Submitted',
          pointsEarned,
          data?.scoreValue || 0.0,
          isFirst,
          data ? (data.timeTaken / 1000).toFixed(1) : (this.settings.maxGuessTime / 1000).toFixed(1),
          awardedBonuses
        )
      );
    });

    this.state = GameState.ROUND_RESULTS;
    this.guessedPlayers = new Set();

    if (this.trackInfo !== null) {
      const roundResults = this.leaderboard.getRoundResults(this.currentRound);
      this.gameStats.updateBestScoringRound(roundResults, this.trackInfo.track);
      this.gameStats.updateLeastScoringRound(roundResults, this.trackInfo.track);
      this.gameStats.updateFastestCorrectGuess(roundResults, this.trackInfo.track);
    }
  }

  public updateStreak(userId: string, scoreMultiplier: number) {
    if (this.streaks[userId] === undefined) {
      this.streaks[userId] = 0;
    }

    if (scoreMultiplier === 1) {
      this.streaks[userId] += 1;
    } else if (scoreMultiplier === 0) {
      this.streaks[userId] = 0;
    }

    this.gameStats.updateHighestStreak(userId, this.streaks[userId]);
  }

  public calculateLostStreaks(): Record<string, number> {
    const roundGuesses = this.guesses[this.currentRound] || {};
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

    const roundGuesses = this.guesses[this.currentRound] || {};

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

  public advanceRound(): string {
    this.readyUsers = new Set();
    this.currentRoundLostStreaks = {};

    if (this.currentRound >= this.settings.rounds) {
      this.state = GameState.FINAL_RESULTS;
      this.applyAchievementBonuses();
      this.leaderboard.sort();
      this.lastWinnerId = this.leaderboard.getWinnerId();
      this.gameStats.endTime = Date.now();
    } else {
      this.state = GameState.TRACK_SELECTION;
      this.currentRound += 1;
    }

    return this.state;
  }

  public async playTrack(track: Track, roundFinishedCallback: () => void): Promise<void> {
    const startTime = Date.now() + COUNTDOWN_DURATION;
    const endTime = startTime + this.settings.maxGuessTime;

    this.trackInfo = {
      url: `/music/${track.audio}`,
      startTime,
      endTime,
      track,
      gameCoverUrl: `/game_covers/${track.cover}`,
    };
    this.state = GameState.PLAYING;
    this.trackHistory.push(track.audio);
    const roundAtStart = this.currentRound;
    const gameAtStart = this.currentGame;

    // Generate the blurred cover art on the server once at the beginning of the round if needed
    if (track.cover && this.settings.enabledJokers.has(Joker.GLIMPSE)) {
      await this.generateBlurredImage(track.cover);
    }

    const totalWaitTime = COUNTDOWN_DURATION + this.settings.maxGuessTime;

    // Set a timer to automatically transition to HOST_REVIEW after maxGuessTime
    this.roundTimeout = setTimeout(() => {
      if (this.state === GameState.PLAYING && this.currentRound === roundAtStart && this.currentGame === gameAtStart) {
        this.state = GameState.HOST_REVIEW;
        logger.debug(`Timer for round ${roundAtStart} expired`, LogCategory.GAME, this.instanceId);

        roundFinishedCallback();
        this.removeTempFiles();
      }
    }, totalWaitTime);
  }

  public restart() {
    this.state = GameState.SETUP;
    this.currentRound = 0;
    this.readyUsers = new Set();
    this.guesses = {};
    this.trackInfo = null;
    this.trackHistory = [];
    this.leaderboard = new Leaderboard();
    this.currentGame += 1;
    this.usedJokers = {};
    this.streaks = {};
    this.gameStats = new GameStats();
    this.activeAchievementBonuses = [];
  }

  public canUseJoker(userId: string, jokerType: Joker): boolean {
    if (!this.usedJokers[userId]) {
      this.usedJokers[userId] = {};
    }

    // Check if joker was used in the past
    if (jokerType in this.usedJokers[userId]) return false;

    // Check if any joker has already been used in this round
    return !Object.values(this.usedJokers[userId]).includes(this.currentRound);
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

        // Obfuscate the rest, but keep a few characters
        return generator.random() < revealPercent ? c : '_';
      })
      .join('');
  }

  private hashWithGameState(str: string): number {
    return hash(`${this.instanceId}-${this.currentGame}-${this.currentRound}-${str}`);
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

  public getSpyHint(userId: string): string | null {
    return this.guesses[this.currentRound]?.[userId]?.text ?? null;
  }

  public async getGlimpseHint(): Promise<string | null> {
    const tempDir = this.temporaryDirectory();
    const imagePath = path.join(tempDir, `glimpse_${this.currentRound}.jpg`);

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
      const outputPath = path.join(outputDir, `glimpse_${this.currentRound}.jpg`);

      await sharp(path.join(getFilePath('game_covers'), coverImageFile))
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

  public markJokerUsed(userId: string, joker: Joker): void {
    if (!this.usedJokers[userId]) {
      this.usedJokers[userId] = {};
    }

    this.usedJokers[userId][joker] = this.currentRound;
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
    // 1. Fastest Correct Guess Achievement Bonus
    if (this.activeAchievementBonuses.includes(AchievementBonusType.FASTEST_CORRECT_GUESS)) {
      const fastestUserId = this.gameStats.fastestCorrectGuess?.roundResults?.userId;
      if (fastestUserId) {
        const entry = this.leaderboard.getOrCreate(fastestUserId);
        entry.addAchievementBonus(AchievementBonusType.FASTEST_CORRECT_GUESS);
      }
    }

    // 2. Highest Streak Achievement Bonus
    if (this.activeAchievementBonuses.includes(AchievementBonusType.HIGHEST_STREAK)) {
      if (this.gameStats.highestStreak?.userIds) {
        for (const userId of this.gameStats.highestStreak.userIds) {
          const entry = this.leaderboard.getOrCreate(userId);
          entry.addAchievementBonus(AchievementBonusType.HIGHEST_STREAK);
        }
      }
    }
  }

  public notifyUpdate(): void {
    this.onUpdate?.(this);
  }

  public dispose(): void {
    this.roundTimeout?.close();
    this.removeTempFiles();
  }

  toJSON() {
    return {
      ...this,
      // Convert Sets to Arrays (Sets serialize to {})
      registeredUsers: Array.from(this.registeredUsers),
      readyUsers: Array.from(this.readyUsers),
      guessedPlayers: Array.from(this.guessedPlayers),
    };
  }
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
