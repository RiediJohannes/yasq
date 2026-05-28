import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameInstance, LeaderboardEntry, Tag, Track, TrackInfo, UserGuess } from './models.js';
import {
  COUNTDOWN_DURATION,
  DEFAULT_FIRST_BONUS_MULTIPLIER,
  FirstBonusMultiplier,
  GameState,
  Joker,
  MAX_TIME_MULTIPLIER,
  MIN_TIME_MULTIPLIER,
  STATIC_FILES_DIR,
  TEMP_FILES_DIR,
  TimeBonus,
} from '@yasq/shared';
import path from "path";
import { setupTempDir } from "./helper.js";
import fs from "fs";

const HOST = "host_123";
const INSTANCE_ID = "mock_instance"
const PLAYER_1 = "player_123"
const PLAYER_2 = "player_456"
const PLAYER_3 = "player_789"

const GAME_A = "Game A"
const GAME_B = "Game B"
const GAME_LONG = "The Game: A Somewhat Long Subtitle"

describe('GameInstance - startGame', () => {
  let game: GameInstance;

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
    game.registeredUsers.add(HOST);
    game.registeredUsers.add(PLAYER_1);
  });

  it('should initialize settings and transition state', () => {
    // Start game with 5 rounds and 15 seconds
    game.setupGame({
      rounds: 5,
      trackDuration: 15,
      enabledJokers: [Joker.OBFUSCATION, Joker.MULTIPLE_CHOICE],
      firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
      timeBonus: TimeBonus.LINEAR
    });
    game.startGame();

    // Assert state and current round
    expect(game.state).toBe(GameState.TRACK_SELECTION);
    expect(game.currentRound).toBe(1);

    // Assert settings (15s should become 15000ms)
    expect(game.settings.rounds).toBe(5);
    expect(game.settings.trackDuration).toBe(15_000);
    expect(game.settings.enabledJokers.has(Joker.OBFUSCATION)).toBe(true);
    expect(game.settings.enabledJokers.has(Joker.MULTIPLE_CHOICE)).toBe(true);
    expect(game.settings.enabledJokers.size).toBe(2);
  });

  it('should add players to leaderboard but exclude the host', () => {
    game.setupGame({
      rounds: 5,
      trackDuration: 15,
      enabledJokers: [],
      firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
      timeBonus: TimeBonus.LINEAR
    });
    game.startGame();

    const entries = game.leaderboard.getAll();

    // Verify player is there
    const hasPlayer = entries.some(e => e.userId === PLAYER_1);
    // Verify host is NOT there
    const hasHost = entries.some(e => e.userId === HOST);

    expect(hasPlayer).toBe(true);
    expect(hasHost).toBe(false);
    expect(entries.length).toBe(1);
  });
});

describe('GameInstance - submitGuess', () => {
  let game: GameInstance;

  beforeEach(() => {
    vi.useFakeTimers(); // Intercept Date.now()
    game = new GameInstance(INSTANCE_ID, HOST);
    game.registeredUsers.add(PLAYER_1);
    game.registeredUsers.add(PLAYER_2);

    // Simulate game already started and in selection state
    game.currentRound = 1;
    const track = new Track("Game A", "Track A", "", "", [])
    game.trackInfo = new TrackInfo("url", Date.now(), Date.now() + 10_000, track, "cover")
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should calculate timeTaken correctly using fake timers', () => {
    // Fast forward time by 4.5 seconds
    vi.advanceTimersByTime(4500);

    game.submitGuess(PLAYER_1, GAME_A);

    const guess = game.guesses[1]![PLAYER_1];
    expect(guess?.timeTaken).toBe(4500);
    expect(guess?.text).toBe(GAME_A);
  });

  it('should transition to ROUND_COMPLETED when the last player guesses', () => {
    expect(game.guessedPlayers.size).toBe(0);

    // First player guesses
    const progress1 = game.submitGuess(PLAYER_1, GAME_A);
    expect(progress1.current).toBe(1);
    expect(game.guessedPlayers.has(PLAYER_1)).toBe(true);
    expect(game.state).not.toBe(GameState.ROUND_COMPLETED);

    // Second (last) player guesses
    const progress2 = game.submitGuess(PLAYER_2, GAME_B);
    expect(progress2.current).toBe(2);
    expect(progress2.total).toBe(2);
    expect(game.guessedPlayers.has(PLAYER_2)).toBe(true);

    // Check state transition
    expect(game.state).toBe(GameState.ROUND_COMPLETED);
  });
});

describe('GameInstance - getTimedOutPlayers', () => {
  it('should return list of players who have not submitted a guess', () => {
    const game = new GameInstance(INSTANCE_ID, HOST);
    game.registeredUsers.add(PLAYER_1);
    game.registeredUsers.add(PLAYER_2);
    game.submitGuess(PLAYER_1, GAME_A);

    const timedOutPlayers = game.getTimedOutPlayers();
    expect(timedOutPlayers).toStrictEqual([PLAYER_2])
  });
});

describe('GameInstance - submitResults', () => {
  let game: GameInstance;

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
    game.registeredUsers.add(PLAYER_1);
    game.registeredUsers.add(PLAYER_2);
    game.registeredUsers.add(PLAYER_3);
    game.setupGame({
      rounds: 10,
      trackDuration: 20, // 20s duration = 20000ms
      enabledJokers: [],
      firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
      timeBonus: TimeBonus.LINEAR
    });
    game.startGame();

    // Manually inject some guesses into the current round
    // Player 1: Correct, took 5s (Multiplier should be 1.75)
    // Player 2: Correct, took 10s (Multiplier should be 1.5), but slower
    game.guesses[1] = {
      [PLAYER_1]: new UserGuess(GAME_A, 5000),
      [PLAYER_2]: new UserGuess(GAME_B, 10_000),
      [PLAYER_3]: new UserGuess(GAME_B, 15_000)
    };
  });

  it('should calculate points with time multipliers and first-place bonus', () => {
    // Host marks all answers as correct (Score Value = 1.0)
    game.submitResults({ [PLAYER_1]: 1, [PLAYER_2]: 1, [PLAYER_3]: 1 });

    const entry1 = game.leaderboard.getEntry(PLAYER_1);
    const entry2 = game.leaderboard.getEntry(PLAYER_2);
    const entry3 = game.leaderboard.getEntry(PLAYER_3);

    // Math for Player 1:
    // Multiplier = 2 (first correct guess) => FirstCorrect = 5000
    // Base = 100 * 1.0 * 2 = 200
    // First Bonus = 200 * 1.2 = 240
    expect(entry1).toBeDefined();
    expect(entry1!.totalScore).toBe(240);
    expect(entry1!.roundHistory).toHaveLength(1);
    expect(entry1!.roundHistory[0]?.isFirst).toBe(true);
    expect(entry1!.roundHistory[0]?.scoreValue).toBe(1);

    // Math for Player 2:
    // Recall: FirstCorrect = 5000, MAX_TIME_MULTPLIER = 2
    // Multiplier = 2 - ((10000-5000) / (20000 - 5000)) = 1.6666
    // Base = 100 * 1.0 * 1.6666 = 166.6 ~= 167
    // No First Bonus
    expect(entry2).toBeDefined();
    expect(entry2!.totalScore).toBe(167);
    expect(entry2!.roundHistory).toHaveLength(1);
    expect(entry2!.roundHistory[0]?.isFirst).toBe(false);
    expect(entry2!.roundHistory[0]?.scoreValue).toBe(1);

    // Math for Player 3:
    // Recall: FirstCorrect = 5000, MAX_TIME_MULTPLIER = 2
    // Multiplier = 2 - ((15000-5000) / (20000 - 5000)) = 1.3333
    // Base = 100 * 1.0 * 1.3333 = 133.3 ~= 133
    // No First Bonus
    expect(entry3).toBeDefined();
    expect(entry3!.totalScore).toBe(133);
    expect(entry3!.roundHistory).toHaveLength(1);
    expect(entry3!.roundHistory[0]?.isFirst).toBe(false);
    expect(entry3!.roundHistory[0]?.scoreValue).toBe(1);
  });

  it('should handle incorrect guesses correctly and assign first bonus to first correct player', () => {
    // Host only marks Player 1 as incorrect (Score Value = 0.0), Player 2 as partially correct (0.5) and Player 3 fully correct (1.0)
    game.submitResults({ [PLAYER_1]: 0, [PLAYER_2]: 0.5, [PLAYER_3]: 1 });

    const entry1 = game.leaderboard.getEntry(PLAYER_1);
    const entry2 = game.leaderboard.getEntry(PLAYER_2);
    const entry3 = game.leaderboard.getEntry(PLAYER_3);

    // Zero Points for Player 1
    expect(entry1).toBeDefined();
    expect(entry1!.totalScore).toBe(0);
    expect(entry1!.roundHistory).toHaveLength(1);
    expect(entry1!.roundHistory[0]?.isFirst).toBe(false);
    expect(entry1!.roundHistory[0]?.scoreValue).toBe(0);

    // Math for Player 2:
    // Recall: MAX_TIME_MULTPLIER = 2
    // Multiplier = 2 (first partially correct guess) => FirstCorrect = 10000
    // Base = 100 * 0.5 * 2 = 100
    // No First Bonus
    expect(entry2).toBeDefined();
    expect(entry2!.totalScore).toBe(100);
    expect(entry2!.roundHistory).toHaveLength(1);
    expect(entry2!.roundHistory[0]?.isFirst).toBe(false);
    expect(entry2!.roundHistory[0]?.scoreValue).toBe(0.5);

    // Math for Player 3:
    // Recall: FirstCorrect = 10000, MAX_TIME_MULTPLIER = 2
    // Multiplier = 2 - ((15000-10000) / (20000 - 10000)) = 1.5
    // Base = 100 * 1.0 * 1.5 = 150
    // First Bonus = 150 * 1.2 = 180
    expect(entry3).toBeDefined();
    expect(entry3!.totalScore).toBe(180);
    expect(entry3!.roundHistory).toHaveLength(1);
    expect(entry3!.roundHistory[0]?.isFirst).toBe(true);
    expect(entry3!.roundHistory[0]?.scoreValue).toBe(1);
  });

  it('should correctly handle time multipliers and first-place bonus if there were no fully correct answers', () => {
    // Host marks both answers as only partially correct (Score Value = 0.5)
    game.submitResults({ [PLAYER_1]: 0.5, [PLAYER_2]: 0.5 });

    const entry1 = game.leaderboard.getEntry(PLAYER_1);
    const entry2 = game.leaderboard.getEntry(PLAYER_2);

    // Math for Player 1:
    // Recall: MAX_TIME_MULTPLIER = 2
    // Multiplier = 2 (first partially correct guess) => FirstCorrect = 5000
    // Base = 100 * 0.5 * 2 = 100
    // No First Bonus
    expect(entry1).toBeDefined();
    expect(entry1!.totalScore).toBe(100);
    expect(entry1!.roundHistory).toHaveLength(1);
    expect(entry1!.roundHistory[0]?.isFirst).toBe(false);
    expect(entry1!.roundHistory[0]?.scoreValue).toBe(0.5);

    // Math for Player 2:
    // Recall: FirstCorrect = 5000, MAX_TIME_MULTPLIER = 2
    // Multiplier = 2 - ((10000-5000) / (20000 - 5000)) = 1.6666
    // Base = 100 * 0.5 * 1.6666 = 83.333 ~= 83
    // No First Bonus
    expect(entry2).toBeDefined();
    expect(entry2!.totalScore).toBe(83);
    expect(entry2!.roundHistory).toHaveLength(1);
    expect(entry2!.roundHistory[0]?.isFirst).toBe(false);
    expect(entry2!.roundHistory[0]?.scoreValue).toBe(0.5);
  });

  it('should transition to RESULTS state and reset guessedPlayers', () => {
    game.guessedPlayers.add(PLAYER_1);

    game.submitResults({});

    expect(game.state).toBe(GameState.RESULTS);
    expect(game.guessedPlayers.size).toBe(0);
  });
});

describe('GameInstance - timeMultiplierEdgeCases', () => {
  const TRACK_DURATION: number = 10_000; // milliseconds
  const game = new GameInstance(INSTANCE_ID, HOST);

  for (const timeBonusSetting in TimeBonus) {
    const bonusType = timeBonusSetting as TimeBonus

    game.setupGame({
      rounds: 1,
      trackDuration: TRACK_DURATION / 1000,
      enabledJokers: [],
      firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
      timeBonus: bonusType
    });

    it(`should assign MAX_TIME_MULTIPLIER for guesses at/before the first success - ${bonusType}`, () => {
      const REALISTIC_SUCCESS = 3000;
      expect(game.calculateTimeMultiplier(REALISTIC_SUCCESS, REALISTIC_SUCCESS)).toBe(MAX_TIME_MULTIPLIER);
      expect(game.calculateTimeMultiplier(0, REALISTIC_SUCCESS)).toBe(MAX_TIME_MULTIPLIER);
      expect(game.calculateTimeMultiplier(-100, REALISTIC_SUCCESS)).toBe(MAX_TIME_MULTIPLIER);

      const IMMEDIATE_SUCCESS = 0;
      expect(game.calculateTimeMultiplier(IMMEDIATE_SUCCESS, IMMEDIATE_SUCCESS)).toBe(MAX_TIME_MULTIPLIER);
      expect(game.calculateTimeMultiplier(0, IMMEDIATE_SUCCESS)).toBe(MAX_TIME_MULTIPLIER);
      expect(game.calculateTimeMultiplier(-100, IMMEDIATE_SUCCESS)).toBe(MAX_TIME_MULTIPLIER);

      const LATE_SUCCESS = TRACK_DURATION;
      expect(game.calculateTimeMultiplier(LATE_SUCCESS, LATE_SUCCESS)).toBe(MAX_TIME_MULTIPLIER);
      expect(game.calculateTimeMultiplier(0, LATE_SUCCESS)).toBe(MAX_TIME_MULTIPLIER);
      expect(game.calculateTimeMultiplier(-100, LATE_SUCCESS)).toBe(MAX_TIME_MULTIPLIER);
    });

    it(`should assign MIN_TIME_MULTIPLIER for guesses at/after the track ended - ${bonusType}`, () => {
      const REALISTIC_SUCCESS = 3000;
      expect(game.calculateTimeMultiplier(TRACK_DURATION, REALISTIC_SUCCESS)).toBe(MIN_TIME_MULTIPLIER);
      expect(game.calculateTimeMultiplier(TRACK_DURATION + 100, REALISTIC_SUCCESS)).toBe(MIN_TIME_MULTIPLIER);

      const IMMEDIATE_SUCCESS = 0;
      expect(game.calculateTimeMultiplier(TRACK_DURATION, IMMEDIATE_SUCCESS)).toBe(MIN_TIME_MULTIPLIER);
      expect(game.calculateTimeMultiplier(TRACK_DURATION + 100, IMMEDIATE_SUCCESS)).toBe(MIN_TIME_MULTIPLIER);

      expect(game.calculateTimeMultiplier(TRACK_DURATION + 100, TRACK_DURATION)).toBe(MIN_TIME_MULTIPLIER);
    });
  }
});

describe('GameInstance - timeMultiplier:LINEAR', () => {
  const game = new GameInstance(INSTANCE_ID, HOST);
  const FIRST_SUCCESS: number = 2000;
  const TRACK_DURATION: number = 12_000;

  game.setupGame({
    rounds: 1,
    trackDuration: TRACK_DURATION / 1000,
    enabledJokers: [],
    firstBonusMultiplier: FirstBonusMultiplier.OFF,
    timeBonus: TimeBonus.LINEAR
  });

  it('should decay time multipliers linearly between the first successful guess and the end of the track', () => {
    const PRECISION = 8;
    expect(game.calculateTimeMultiplier(FIRST_SUCCESS, FIRST_SUCCESS)).toBeCloseTo(2.0, PRECISION);
    expect(game.calculateTimeMultiplier(3000, FIRST_SUCCESS)).toBeCloseTo(1.9, PRECISION);
    expect(game.calculateTimeMultiplier(4000, FIRST_SUCCESS)).toBeCloseTo(1.8, PRECISION);
    expect(game.calculateTimeMultiplier(5000, FIRST_SUCCESS)).toBeCloseTo(1.7, PRECISION);
    expect(game.calculateTimeMultiplier(6000, FIRST_SUCCESS)).toBeCloseTo(1.6, PRECISION);
    expect(game.calculateTimeMultiplier(8000, FIRST_SUCCESS)).toBeCloseTo(1.4, PRECISION);
    expect(game.calculateTimeMultiplier(10_000, FIRST_SUCCESS)).toBeCloseTo(1.2, PRECISION);
    expect(game.calculateTimeMultiplier(TRACK_DURATION, FIRST_SUCCESS)).toBeCloseTo(1.0, PRECISION);
  });
});

describe('GameInstance - timeMultiplier:EXPONENTIAL', () => {
  const game = new GameInstance(INSTANCE_ID, HOST);
  const FIRST_SUCCESS: number = 2000;
  const TRACK_DURATION: number = 12_000;

  game.setupGame({
    rounds: 1,
    trackDuration: TRACK_DURATION / 1000,
    enabledJokers: [],
    firstBonusMultiplier: FirstBonusMultiplier.OFF,
    timeBonus: TimeBonus.EXPONENTIAL
  });

  it('should decay time multipliers exponentially between the first successful guess and the end of the track', () => {
    const PRECISION = 6;
    // Function values are calculated as follows:
    // x: scaled evaluation point (in [0,1)), k: EXPONENTIAL_DECAY_INTENSITY constant
    // f(x) = (1/e^(k * x) - 1/e^k) / (1 - 1/e^k)
    expect(game.calculateTimeMultiplier(FIRST_SUCCESS, FIRST_SUCCESS)).toBeCloseTo(2.0, PRECISION);
    expect(game.calculateTimeMultiplier(3000, FIRST_SUCCESS)).toBeCloseTo(1.75901993, PRECISION);
    expect(game.calculateTimeMultiplier(4000, FIRST_SUCCESS)).toBeCloseTo(1.57134447, PRECISION);
    expect(game.calculateTimeMultiplier(5000, FIRST_SUCCESS)).toBeCloseTo(1.42518267, PRECISION);
    expect(game.calculateTimeMultiplier(6000, FIRST_SUCCESS)).toBeCloseTo(1.31135175, PRECISION);
    expect(game.calculateTimeMultiplier(8000, FIRST_SUCCESS)).toBeCloseTo(1.15365819, PRECISION);
    expect(game.calculateTimeMultiplier(10_000, FIRST_SUCCESS)).toBeCloseTo(1.05801221, PRECISION);
    expect(game.calculateTimeMultiplier(TRACK_DURATION, FIRST_SUCCESS)).toBeCloseTo(1.0, PRECISION);
  });
});

describe('GameInstance - timeMultiplier:LOGISTIC', () => {
  const game = new GameInstance(INSTANCE_ID, HOST);
  const FIRST_SUCCESS: number = 2000;
  const TRACK_DURATION: number = 12_000;

  game.setupGame({
    rounds: 1,
    trackDuration: TRACK_DURATION / 1000,
    enabledJokers: [],
    firstBonusMultiplier: FirstBonusMultiplier.OFF,
    timeBonus: TimeBonus.LOGISTIC
  });

  it('should decay time multipliers logistically/sigmoidally between the first successful guess and the end of the track', () => {
    const PRECISION = 6;
    expect(game.calculateTimeMultiplier(FIRST_SUCCESS, FIRST_SUCCESS)).toBeCloseTo(2.0, PRECISION);
    expect(game.calculateTimeMultiplier(3000, FIRST_SUCCESS)).toBeCloseTo(1.99275028, PRECISION);
    expect(game.calculateTimeMultiplier(4000, FIRST_SUCCESS)).toBeCloseTo(1.96907309, PRECISION);
    expect(game.calculateTimeMultiplier(5000, FIRST_SUCCESS)).toBeCloseTo(1.90425200, PRECISION);
    expect(game.calculateTimeMultiplier(6000, FIRST_SUCCESS)).toBeCloseTo(1.75276270, PRECISION);
    expect(game.calculateTimeMultiplier(7000, FIRST_SUCCESS)).toBeCloseTo(1.5, PRECISION);
    expect(game.calculateTimeMultiplier(8000, FIRST_SUCCESS)).toBeCloseTo(1.24723729, PRECISION);
    expect(game.calculateTimeMultiplier(9000, FIRST_SUCCESS)).toBeCloseTo(1.09574799, PRECISION);
    expect(game.calculateTimeMultiplier(10_000, FIRST_SUCCESS)).toBeCloseTo(1.03092690, PRECISION);
    expect(game.calculateTimeMultiplier(11_000, FIRST_SUCCESS)).toBeCloseTo(1.00724971, PRECISION);
    expect(game.calculateTimeMultiplier(TRACK_DURATION, FIRST_SUCCESS)).toBeCloseTo(1.0, PRECISION);
  });
});

describe('GameInstance - timeMultiplier:CONSTANT', () => {
  const game = new GameInstance(INSTANCE_ID, HOST);
  const FIRST_SUCCESS: number = 2000;
  const TRACK_DURATION: number = 12_000;

  game.setupGame({
    rounds: 1,
    trackDuration: TRACK_DURATION / 1000,
    enabledJokers: [],
    firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
    timeBonus: null  // no time bonus
  });

  it('should always assign the same constant time multiplier independent of answer time', () => {
    const CONSTANT = game.calculateTimeMultiplier(0, 0);

    expect(game.calculateTimeMultiplier(FIRST_SUCCESS, FIRST_SUCCESS)).toBe(CONSTANT);
    expect(game.calculateTimeMultiplier(3000, FIRST_SUCCESS)).toBe(CONSTANT);
    expect(game.calculateTimeMultiplier(4000, FIRST_SUCCESS)).toBe(CONSTANT);
    expect(game.calculateTimeMultiplier(5000, FIRST_SUCCESS)).toBe(CONSTANT);
    expect(game.calculateTimeMultiplier(6000, FIRST_SUCCESS)).toBe(CONSTANT);
    expect(game.calculateTimeMultiplier(8000, FIRST_SUCCESS)).toBe(CONSTANT);
    expect(game.calculateTimeMultiplier(10_000, FIRST_SUCCESS)).toBe(CONSTANT);
    expect(game.calculateTimeMultiplier(TRACK_DURATION, FIRST_SUCCESS)).toBe(CONSTANT);
  });
});

describe('GameInstance - advanceRound', () => {
  let game: GameInstance;

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
    game.setupGame({
      rounds: 3,
      trackDuration: 20,
      enabledJokers: [],
      firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
      timeBonus: TimeBonus.LINEAR
    });
    game.startGame();
    game.readyUsers.add(PLAYER_1);
    game.readyUsers.add(PLAYER_2);

    const entry1 = new LeaderboardEntry(PLAYER_1);
    entry1.totalScore = 500;
    game.leaderboard.addEntry(entry1);
    const entry2 = new LeaderboardEntry(PLAYER_2);
    entry2.totalScore = 1000;
    game.leaderboard.addEntry(entry2);
  });

  it('should move to next round if currentRound < total rounds', () => {
    // We are on round 1 of 3
    const nextState = game.advanceRound();

    expect(game.readyUsers.size).toBe(0);
    expect(nextState).toBe(GameState.TRACK_SELECTION);
    expect(game.currentRound).toBe(2);
    expect(game.state).toBe(GameState.TRACK_SELECTION);
  });

  it('should finish the game and set lastWinnerId when final round is reached', () => {
    // Manually push to the final round (3 of 3)
    game.currentRound = 3;

    const nextState = game.advanceRound();

    expect(nextState).toBe(GameState.GAME_FINISHED);
    expect(game.lastWinnerId).toBe(PLAYER_2);
    expect(game.state).toBe(GameState.GAME_FINISHED);
  });
});

describe('GameInstance - playTrack', () => {
  let game: GameInstance;

  const mockCallback = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    mockCallback.mockClear();
    game = new GameInstance(INSTANCE_ID, HOST);
    game.settings.trackDuration = 10_000; // 10 seconds
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should set correct TrackInfo and transition to PLAYING', async () => {
    const track = new Track(GAME_A, "Track A", "file123", "", []);

    await game.playTrack(track, mockCallback);

    const expectedStart = Date.now() + 4000; // now + countdown
    const expectedEnd = expectedStart + 10_000; // start + duration

    expect(game.state).toBe(GameState.PLAYING);
    expect(game.trackInfo?.startTime).toBe(expectedStart);
    expect(game.trackInfo?.endTime).toBe(expectedEnd);
    expect(game.trackHistory).toContain("file123");
  });

  it('should transition to ROUND_COMPLETED automatically after time expires', async () => {
    const track = new Track(GAME_A, "Track A", "file123", "", []);
    await game.playTrack(track, mockCallback);

    // Verify we are still playing initially
    expect(game.state).toBe(GameState.PLAYING);

    // Fast-forward time by 13.9 seconds (countdown + duration - 100ms)
    vi.advanceTimersByTime(13_900);
    expect(game.state).toBe(GameState.PLAYING);

    // Jump past the finish line (14.1 seconds total)
    vi.advanceTimersByTime(200);

    expect(game.state).toBe(GameState.ROUND_COMPLETED);
    expect(mockCallback).toHaveBeenCalled()
  });

  it('should not transition if the round has already changed (Race Condition Check)', async () => {
    const track = new Track(GAME_A, "Track A", "file123", "", []);
    await game.playTrack(track, mockCallback);

    // Manually bump the round (simulating all players submitted guess before countdown ends)
    game.currentRound = 2;

    // Fast-forward through the total duration
    vi.advanceTimersByTime(15_000);

    // The state should NOT be ROUND_COMPLETED because the roundAtStart check fails
    expect(game.state).not.toBe(GameState.ROUND_COMPLETED);
  });
});

describe('GameInstance - canUseJoker', () => {
  let game: GameInstance;

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
  });

  it('should allow player to use joker if joker not yet used', () => {
    const allowed = game.canUseJoker(PLAYER_1, Joker.OBFUSCATION);
    expect(allowed).toBe(true);
  });

  it('should forbid player to use joker if joker already used', () => {
    game.markJokerUsed(PLAYER_1, Joker.OBFUSCATION);
    const allowed = game.canUseJoker(PLAYER_1, Joker.OBFUSCATION);
    expect(allowed).toBe(false);
  });
});

describe('GameInstance - getPartialHint', () => {
  let game: GameInstance;

  const mockCallback = vi.fn();

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
  });

  it('should return a string of underscores and special characters matching the title length', async () => {
    const track = new Track(GAME_LONG, "", "", "", []);
    await game.playTrack(track, mockCallback);
    const hint = game.getPartialHint(0.5);

    expect(hint.length).toBe(GAME_LONG.length);
    expect(hint).toContain('_');  // chance of not getting a single underscore is virtually 0 (0.5**GAME_LONG.length)
    expect(hint[3]).toBe(' ');
    expect(hint[8]).toBe(':');
    expect(hint[9]).toBe(' ');
  });

  it('should return a consistent hint for the same instance_id + solution combination', async () => {
    const track = new Track(GAME_LONG, "", "", "", []);

    await game.playTrack(track, mockCallback);

    // run hint generation multiple times to be sure
    const probabilities = [0.0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0]
    const REROLLS = 10;
    for (const prob of probabilities) {
      const controlHint = game.getPartialHint(prob)

      for (let i = 0; i < REROLLS; i++) {
        expect(game.getPartialHint(prob)).toBe(controlHint); // re-running must not change hint
      }
    }
  });

  it('should return a different hint for another game', async () => {
    const track = new Track(GAME_LONG, "", "", "", []);
    const newGame = new GameInstance("NEW_" + INSTANCE_ID, HOST);

    await game.playTrack(track, mockCallback)
    await newGame.playTrack(track, mockCallback);

    const controlHint = game.getPartialHint(0.5);
    const differentHint = newGame.getPartialHint(0.5);

    // This check will always be stable if it succeeds once since the hash function is seeded
    expect(differentHint).not.toBe(controlHint);
  });
});

describe('GameInstance - getTagHint', () => {
  let game: GameInstance;

  const mockCallback = vi.fn();

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
  });

  it('should return the corresponding tags', async () => {
    const track = new Track(GAME_A, "", "", "", [new Tag("platform", "Platform A"), new Tag("release", "2026")])
    await game.playTrack(track, mockCallback);
    const hint = game.getTagHint();

    expect(hint.length).toBe(2);
    expect(hint[0]).toStrictEqual(new Tag("platform", "Platform A"));
    expect(hint[1]).toStrictEqual(new Tag("release", "2026"));
  });
});

describe('GameInstance - getAnswersHint', () => {
  let game: GameInstance, gameSameId: GameInstance;

  const mockCallback = vi.fn();
  const correctTrack = new Track(GAME_A, "Track A", "1", "", [])
  const wrongTracks = [
    new Track("Game B", "Track B", "2", "", []),
    new Track("Game C", "Track C", "3", "", []),
    new Track("Game D", "Track D", "4", "", []),
    new Track("Game E", "Track E", "5", "", [])
  ];
  const allTracks = [correctTrack, ...wrongTracks];

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
    gameSameId = new GameInstance(INSTANCE_ID, HOST);
  });

  it('should return a list of four answers (correct + three wrong)', async () => {
    await game.playTrack(correctTrack, mockCallback);
    const hint = game.getMultipleChoiceHint(allTracks);

    expect(hint.length).toBe(4);
    expect(hint).toContain(GAME_A);

    // Check if hint contains four unique answers
    const uniqueCount = new Set(hint).size;
    expect(uniqueCount).toBe(4);

    // Check if wrong answers are all included in our wrongTracks list
    const wrongTitles = wrongTracks.map(t => t.game);
    const selectedWrongAnswers = hint.filter(title => title !== GAME_A);

    expect(selectedWrongAnswers.length).toBe(3);
    selectedWrongAnswers.forEach(title => {
      expect(wrongTitles).toContain(title);
    });
  });

  it('should return the same list of answers for the same instance_id + solution combination', async () => {
    await game.playTrack(correctTrack, mockCallback);
    await gameSameId.playTrack(correctTrack, mockCallback);

    // run hint generation multiple times to be sure
    for (let i = 0; i < 10; i++) {
      const controlHint = game.getMultipleChoiceHint(allTracks);

      expect(game.getMultipleChoiceHint(allTracks)).toStrictEqual(controlHint); // re-running must not change hint
      expect(gameSameId.getMultipleChoiceHint(allTracks)).toStrictEqual(controlHint);
    }
  })
});

describe('GameInstance - getGlimpseHint', () => {
  let game: GameInstance;

  const rootDir: string = process.cwd();
  const gameCoverDir: string = path.join(rootDir, STATIC_FILES_DIR, "game_covers");
  const MOCK_SECRET = 'test-secret';

  const mockCallback = vi.fn();
  const testCover = "test.png";
  const track = new Track(GAME_A, "Track A", "test.mp3", testCover, [])

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
    setupTempDir(rootDir);

    vi.stubEnv('VITE_DISCORD_CLIENT_ID', MOCK_SECRET);  // mock client secret env var

    // Create a minimal test image
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    const testImagePath = path.join(gameCoverDir, testCover);
    fs.writeFileSync(testImagePath, testImageBuffer);
  });

  afterEach(() => {
    // Clean up temporary test image
    fs.rmSync('./temp', { recursive: true, force: true });
  })

  it('should generate a modified JPEG version of the cover image at the beginning of the round', async () => {
    game.setupGame({
      rounds: 3,
      trackDuration: 20,
      enabledJokers: [Joker.OBFUSCATION, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE],
      firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
      timeBonus: TimeBonus.LINEAR
    });

    const instanceTempDir = path.join(rootDir, STATIC_FILES_DIR, TEMP_FILES_DIR, game.instanceId);
    // Instance temp dir is automatically created when needed
    expect(fs.existsSync(instanceTempDir)).toBeFalsy();
    await game.playTrack(track, mockCallback);
    expect(fs.existsSync(instanceTempDir)).toBeTruthy();

    // Instance temp dir contains the modified image file with the expected name
    expect(process.env.VITE_DISCORD_CLIENT_ID).toBe(MOCK_SECRET);
    const secretHash = game.hashWithGameState(MOCK_SECRET)
    expect(fs.readdirSync(instanceTempDir)).toContain(`glimpse_${secretHash}.jpg`);

    // Temp image is different from original image
    const originalImg = fs.readFileSync(path.join(rootDir, STATIC_FILES_DIR, "game_covers", track.cover));
    const modifiedImg = fs.readFileSync(path.join(instanceTempDir, `glimpse_${secretHash}.jpg`));
    expect(originalImg).not.toEqual(modifiedImg);
  });

  it("should clean up its own temp directory when the round timer runs out", async () => {
    vi.useFakeTimers();

    game.setupGame({
      rounds: 3,
      trackDuration: 10,
      enabledJokers: [Joker.OBFUSCATION, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE],
      firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
      timeBonus: TimeBonus.LINEAR
    });

    const instanceTempDir = path.join(rootDir, STATIC_FILES_DIR, TEMP_FILES_DIR, game.instanceId);
    await game.playTrack(track, mockCallback);

    const secretHash = game.hashWithGameState(MOCK_SECRET)
    expect(fs.existsSync(instanceTempDir)).toBeTruthy();
    expect(fs.readdirSync(instanceTempDir)).toContain(`glimpse_${secretHash}.jpg`);

    // Instance temp dir was removed after the round timer ran out
    vi.advanceTimersByTime(game.settings.trackDuration + COUNTDOWN_DURATION + 100);
    expect(fs.existsSync(instanceTempDir)).toBeFalsy();
  });

  it("should clean up its own temp directory after the last player has guessed", async () => {
    game.setupGame({
      rounds: 3,
      trackDuration: 10,
      enabledJokers: [Joker.OBFUSCATION, Joker.MULTIPLE_CHOICE, Joker.GLIMPSE],
      firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
      timeBonus: TimeBonus.LINEAR
    });

    game.registeredUsers.add(PLAYER_1);
    game.registeredUsers.add(PLAYER_2);

    const instanceTempDir = path.join(rootDir, STATIC_FILES_DIR, TEMP_FILES_DIR, game.instanceId);
    await game.playTrack(track, mockCallback);

    const secretHash = game.hashWithGameState(MOCK_SECRET)
    expect(fs.existsSync(instanceTempDir)).toBeTruthy();
    expect(fs.readdirSync(instanceTempDir)).toContain(`glimpse_${secretHash}.jpg`);

    game.submitGuess(PLAYER_1, GAME_A);
    expect(fs.existsSync(instanceTempDir)).toBeTruthy();  // still there
    game.submitGuess(PLAYER_2, GAME_B);

    // Instance temp dir was removed after the last player submitted their guess
    expect(fs.existsSync(instanceTempDir)).toBeFalsy();
  });

  it('should NOT generate a temporary image file if GLIMPSE is not among the enabled jokers', async () => {
    game.setupGame({
      rounds: 3,
      trackDuration: 20,
      enabledJokers: [Joker.OBFUSCATION, Joker.MULTIPLE_CHOICE],
      firstBonusMultiplier: DEFAULT_FIRST_BONUS_MULTIPLIER,
      timeBonus: TimeBonus.LINEAR
    });

    const instanceTempDir = path.join(rootDir, STATIC_FILES_DIR, TEMP_FILES_DIR, game.instanceId);
    expect(fs.existsSync(instanceTempDir)).toBeFalsy();

    await game.playTrack(track, mockCallback);
    expect(fs.existsSync(instanceTempDir)).toBeFalsy();
  });
});

describe('GameInstance - pickNewHost', () => {
  let game: GameInstance;

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
  });

  it('should return false if there are no more registered users', () => {
    game.registeredUsers = new Set();

    const isGameActive = game.pickNewHost();

    expect(isGameActive).toBe(false);
  });

  it('should pick the first available player and return true', () => {
    game.registeredUsers = new Set([PLAYER_1, PLAYER_2]);

    const isGameActive = game.pickNewHost();

    expect(isGameActive).toBe(true);
    expect(game.hostId).toBe(PLAYER_1);
  });
});