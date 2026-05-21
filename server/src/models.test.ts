import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameInstance, LeaderboardEntry, Tag, Track, TrackInfo, UserGuess } from './models.js';
import { GameState, Joker } from '@yasq/shared';

const HOST = "host_123";
const INSTANCE_ID = "mock_instance"
const PLAYER_1 = "player_123"
const PLAYER_2 = "player_456"

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
    game.setupGame(5, 15, [Joker.OBFUSCATION, Joker.MULTIPLE_CHOICE]);
    game.startGame();

    // Assert state and current round
    expect(game.state).toBe(GameState.TRACK_SELECTION);
    expect(game.currentRound).toBe(1);

    // Assert settings (15s should become 15000ms)
    expect(game.settings.rounds).toBe(5);
    expect(game.settings.trackDuration).toBe(15000);
    expect(game.settings.enabledJokers.has(Joker.OBFUSCATION)).toBe(true);
    expect(game.settings.enabledJokers.has(Joker.MULTIPLE_CHOICE)).toBe(true);
    expect(game.settings.enabledJokers.size).toBe(2);
  });

  it('should add players to leaderboard but exclude the host', () => {
    game.setupGame(5, 15, []);
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
    game.trackInfo = new TrackInfo("url", Date.now(), Date.now() + 10000, track, "cover")
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
    game.setupGame(10, 20, []); // 20s duration = 20000ms
    game.startGame();

    // Manually inject some guesses into the current round
    // Player 1: Correct, took 5s (Multiplier should be 1.75)
    // Player 2: Correct, took 10s (Multiplier should be 1.5), but slower
    game.guesses[1] = {
      [PLAYER_1]: new UserGuess(GAME_A, 5000),
      [PLAYER_2]: new UserGuess(GAME_B, 10000)
    };
  });

  it('should calculate points with time multipliers and first-place bonus', () => {
    // Host marks both as correct (Score Value = 1.0)
    game.submitResults({ [PLAYER_1]: 1, [PLAYER_2]: 1 });

    const entry1 = game.leaderboard.getEntry(PLAYER_1);
    const entry2 = game.leaderboard.getEntry(PLAYER_2);

    // Math for Player 1:
    // Multiplier = 2 - (5000 / 20000) = 1.75
    // Base = 100 * 1.0 * 1.75 = 175
    // First Bonus = 175 * 1.2 = 210
    expect(entry1).toBeDefined();
    expect(entry1!.totalScore).toBe(210);
    expect(entry1!.roundHistory).toHaveLength(1);
    expect(entry1!.roundHistory[0]?.isFirst).toBe(true);
    expect(entry1!.roundHistory[0]?.scoreValue).toBe(1);

    // Math for Player 2:
    // Multiplier = 2 - (10000 / 20000) = 1.5
    // Base = 100 * 1.0 * 1.5 = 150
    // No First Bonus
    expect(entry2).toBeDefined();
    expect(entry2!.totalScore).toBe(150);
    expect(entry2!.roundHistory).toHaveLength(1);
    expect(entry2!.roundHistory[0]?.isFirst).toBe(false);
    expect(entry2!.roundHistory[0]?.scoreValue).toBe(1);
  });

  it('should handle incorrect guesses correctly and assign first bonus to first correct player', () => {
    // Host only marks Player 2 as correct (Score Value = 1.0)
    game.submitResults({ [PLAYER_1]: 0, [PLAYER_2]: 1 });

    const entry1 = game.leaderboard.getEntry(PLAYER_1);
    const entry2 = game.leaderboard.getEntry(PLAYER_2);

    // Zero Points for Player 1
    expect(entry1).toBeDefined();
    expect(entry1!.totalScore).toBe(0);
    expect(entry1!.roundHistory).toHaveLength(1);
    expect(entry1!.roundHistory[0]?.isFirst).toBe(false);
    expect(entry1!.roundHistory[0]?.scoreValue).toBe(0);

    // Math for Player 2:
    // Multiplier = 2 - (10000 / 20000) = 1.5
    // Base = 100 * 1.0 * 1.5 = 150
    // First Bonus = 150 * 1.2 = 180
    expect(entry2).toBeDefined();
    expect(entry2!.totalScore).toBe(180);
    expect(entry2!.roundHistory).toHaveLength(1);
    expect(entry2!.roundHistory[0]?.isFirst).toBe(true);
    expect(entry2!.roundHistory[0]?.scoreValue).toBe(1);
  });

  it('should transition to RESULTS state and reset guessedPlayers', () => {
    game.guessedPlayers.add(PLAYER_1);

    game.submitResults({});

    expect(game.state).toBe(GameState.RESULTS);
    expect(game.guessedPlayers.size).toBe(0);
  });
});

describe('GameInstance - advanceRound', () => {
  let game: GameInstance;

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
    game.setupGame(3, 20, []); // 3 rounds
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

  beforeEach(() => {
    vi.useFakeTimers();
    game = new GameInstance(INSTANCE_ID, HOST);
    game.settings.trackDuration = 10000; // 10 seconds
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should set correct TrackInfo and transition to PLAYING', () => {
    const track = new Track(GAME_A, "Track A", "file123", "", []);

    game.playTrack(track);

    const expectedStart = Date.now() + 4000; // now + countdown
    const expectedEnd = expectedStart + 10000; // start + duration

    expect(game.state).toBe(GameState.PLAYING);
    expect(game.trackInfo?.startTime).toBe(expectedStart);
    expect(game.trackInfo?.endTime).toBe(expectedEnd);
    expect(game.trackHistory).toContain("file123");
  });

  it('should transition to ROUND_COMPLETED automatically after time expires', () => {
    const track = new Track(GAME_A, "Track A", "file123", "", []);
    game.playTrack(track);

    // Verify we are still playing initially
    expect(game.state).toBe(GameState.PLAYING);

    // Fast forward time by 13.9 seconds (countdown + duration - 100ms)
    vi.advanceTimersByTime(13900);
    expect(game.state).toBe(GameState.PLAYING);

    // Jump past the finish line (14.1 seconds total)
    vi.advanceTimersByTime(200);

    expect(game.state).toBe(GameState.ROUND_COMPLETED);
  });

  it('should not transition if the round has already changed (Race Condition Check)', () => {
    const track = new Track(GAME_A, "Track A", "file123", "", []);
    game.playTrack(track);

    // Manually bump the round (simulating all players submitted guess before countdown ends)
    game.currentRound = 2;

    // Fast forward through the total duration
    vi.advanceTimersByTime(15000);

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

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
  });

  it('should return a string of underscores and special characters matching the title length', () => {
    const track = new Track(GAME_LONG, "", "", "", []);
    game.playTrack(track);
    const hint = game.getPartialHint(0.5);

    expect(hint.length).toBe(GAME_LONG.length);
    expect(hint).toContain('_');  // chance of not getting a single underscore is virtually 0 (0.5**GAME_LONG.length)
    expect(hint[3]).toBe(' ');
    expect(hint[8]).toBe(':');
    expect(hint[9]).toBe(' ');
  });

  it('should return a consistent hint for the same instance_id + solution combination', () => {
    const track = new Track(GAME_LONG, "", "", "", []);

    game.playTrack(track);

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

  it('should return a different hint for another game', () => {
    const track = new Track(GAME_LONG, "", "", "", []);
    const newGame = new GameInstance("NEW_" + INSTANCE_ID, HOST);

    game.playTrack(track)
    newGame.playTrack(track);

    const controlHint = game.getPartialHint(0.5);
    const differentHint = newGame.getPartialHint(0.5);

    // This check will always be stable if it succeeds once since the hash function is seeded
    expect(differentHint).not.toBe(controlHint);
  });
});

describe('GameInstance - getTagHint', () => {
  let game: GameInstance;

  beforeEach(() => {
    game = new GameInstance(INSTANCE_ID, HOST);
  });

  it('should return the coressponding tags', () => {
    const track = new Track(GAME_A, "", "", "", [new Tag("platform", "Platform A"), new Tag("release", "2026")])
    game.playTrack(track);
    const hint = game.getTagHint();

    expect(hint.length).toBe(2);
    expect(hint[0]).toStrictEqual(new Tag("platform", "Platform A"));
    expect(hint[1]).toStrictEqual(new Tag("release", "2026"));
  });
});

describe('GameInstance - getAnswersHint', () => {
  let game: GameInstance, gameSameId: GameInstance;

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

  it('should return a list of four answers (correct + three wrong)', () => {
    game.playTrack(correctTrack);
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

  it('should return the same list of answers for the same instance_id + solution combination', () => {
    game.playTrack(correctTrack);
    gameSameId.playTrack(correctTrack);

    // run hint generation multiple times to be sure
    for (let i = 0; i < 10; i++) {
      const controlHint = game.getMultipleChoiceHint(allTracks);

      expect(game.getMultipleChoiceHint(allTracks)).toStrictEqual(controlHint); // re-running must not change hint
      expect(gameSameId.getMultipleChoiceHint(allTracks)).toStrictEqual(controlHint);
    }
  })
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