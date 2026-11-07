import { describe, it, expect, beforeEach } from 'vitest';
import {
  AchievementBonusAggregate,
  AchievementBonusFilter,
  AchievementBonusGoal,
  AchievementBonusManager,
  AchievementBonusMetric,
  type AchievementRule,
} from './achievement_bonus.js';
import type { UserRoundResult } from './leaderboard.js';
import type { TrackInfo } from '@yasq/shared';

const SAMPLE_TRACK = {
  url: '',
  gameCoverUrl: '',
  track: {
    game: 'GAME_A',
    title: 'Track A',
    audio: 'track001.mp3',
    cover: 'game_a.png',
    tags: [
      { type: 'Publisher', value: 'Publisher A' },
      { type: 'Genre', value: 'Genre A' },
    ],
  },
} satisfies TrackInfo;

describe('AchievementBonusManager', () => {
  let rules: AchievementRule[];
  let achievements: AchievementBonusManager;
  let mockTrackInfo: TrackInfo;

  beforeEach(() => {
    rules = [
      {
        id: 'highestStreak',
        metric: AchievementBonusMetric.STREAK,
        goal: AchievementBonusGoal.HIGHEST,
        reward: 100,
      },
      {
        id: 'slowestAverageGuess',
        metric: AchievementBonusMetric.GUESS_TIME,
        filter: AchievementBonusFilter.CORRECT,
        aggregate: AchievementBonusAggregate.AVERAGE,
        goal: AchievementBonusGoal.HIGHEST,
        reward: 50,
      },
      {
        id: 'mostPartiallyCorrectGuesses',
        metric: AchievementBonusMetric.SCORE,
        filter: AchievementBonusFilter.PARTIALLY_CORRECT,
        aggregate: AchievementBonusAggregate.COUNT,
        goal: AchievementBonusGoal.HIGHEST,
        reward: 75,
      },
      {
        id: 'fastestCorrectGuess',
        metric: AchievementBonusMetric.GUESS_TIME,
        filter: AchievementBonusFilter.CORRECT,
        aggregate: AchievementBonusAggregate.MIN,
        goal: AchievementBonusGoal.LOWEST,
        reward: 100,
      },
    ];

    achievements = new AchievementBonusManager(rules);
    mockTrackInfo = SAMPLE_TRACK;
  });

  it('should track and update direct metrics like streaks correctly', () => {
    achievements.updateMetric('user1', AchievementBonusMetric.STREAK, 3);
    achievements.updateMetric('user2', AchievementBonusMetric.STREAK, 5);

    let state = achievements.achievements.get('highestStreak');
    expect(state?.userIds).toEqual(['user2']);
    expect(state?.value).toBe(5);

    // Test a tie
    achievements.updateMetric('user1', AchievementBonusMetric.STREAK, 5);
    state = achievements.achievements.get('highestStreak');
    expect(state?.userIds.sort()).toEqual(['user1', 'user2'].sort());
    expect(state?.value).toBe(5);

    // Test a new high score
    achievements.updateMetric('user2', AchievementBonusMetric.STREAK, 6);
    state = achievements.achievements.get('highestStreak');
    expect(state?.userIds).toEqual(['user2']);
    expect(state?.value).toBe(6);
  });

  it('should only update metric if condition is met', () => {
    achievements.updateMetric('user1', AchievementBonusMetric.STREAK, 3);
    achievements.updateMetric('user1', AchievementBonusMetric.STREAK, 2, (current, incoming) => incoming > current);

    const state = achievements.achievements.get('highestStreak');
    expect(state?.userIds).toEqual(['user1']);
    expect(state?.value).toBe(3);

    achievements.updateMetric('user1', AchievementBonusMetric.STREAK, 4, (current, incoming) => incoming > current);
    const updatedState = achievements.achievements.get('highestStreak');
    expect(updatedState?.userIds).toEqual(['user1']);
    expect(updatedState?.value).toBe(4);
  });

  it('should compute filtered and aggregated round metrics correctly', () => {
    const round1: UserRoundResult[] = [
      { userId: 'user1', scoreValue: 1, time: 2000 } as UserRoundResult,
      { userId: 'user2', scoreValue: 1, time: 4000 } as UserRoundResult,
    ];

    const round2: UserRoundResult[] = [
      { userId: 'user1', scoreValue: 1, time: 1000 } as UserRoundResult,
      { userId: 'user2', scoreValue: 1, time: 2000 } as UserRoundResult,
    ];

    achievements.processRound(round1, mockTrackInfo);
    achievements.processRound(round2, mockTrackInfo);

    // user1 averages: (2000 + 1000) / 2 = 1500
    // user2 averages: (4000 + 2000) / 2 = 3000
    // Goal is highest average guess time -> user2 wins
    const state = achievements.achievements.get('slowestAverageGuess');
    expect(state?.userIds).toEqual(['user2']);
    expect(state?.value).toBe(3000);
  });

  it('should respect filters (e.g., only counting correct guesses)', () => {
    const roundResults: UserRoundResult[] = [
      { userId: 'user1', scoreValue: 0, time: 5000 } as UserRoundResult, // Incorrect, should be filtered out for slowestAverageGuess
      { userId: 'user1', scoreValue: 1, time: 2000 } as UserRoundResult, // Correct
      { userId: 'user2', scoreValue: 1, time: 3000 } as UserRoundResult, // Correct
    ];

    achievements.processRound(roundResults, mockTrackInfo);

    // user1 valid time: 2000 (avg = 2000)
    // user2 valid time: 3000 (avg = 3000)
    const state = achievements.achievements.get('slowestAverageGuess');
    expect(state?.userIds).toEqual(['user2']);
    expect(state?.value).toBe(3000);
  });

  it('should count occurrences correctly for COUNT aggregate', () => {
    const roundResults: UserRoundResult[] = [
      { userId: 'user1', scoreValue: 0.5 } as UserRoundResult, // Partially correct
      { userId: 'user1', scoreValue: 0.5 } as UserRoundResult, // Partially correct
      { userId: 'user2', scoreValue: 0.5 } as UserRoundResult, // Partially correct
      { userId: 'user2', scoreValue: 1 } as UserRoundResult, // Correct, should be filtered out for mostPartiallyCorrectGuesses
    ];

    achievements.processRound(roundResults, mockTrackInfo);

    const state = achievements.achievements.get('mostPartiallyCorrectGuesses');
    expect(state?.userIds).toEqual(['user1']);
    expect(state?.value).toBe(2); // user1 has 2 partially correct guesses
  });

  it('should only update round and track info if value is better than existing', () => {
    const roundResults: UserRoundResult[] = [
      { userId: 'user1', scoreValue: 1, time: 3000, round: 1 } as UserRoundResult,
      { userId: 'user2', scoreValue: 1, time: 2000, round: 1 } as UserRoundResult,
    ];

    achievements.processRound(roundResults, mockTrackInfo);

    let state = achievements.achievements.get('fastestCorrectGuess');
    expect(state?.userIds).toEqual(['user2']);
    expect(state?.value).toBe(2000);
    expect(state?.extraData?.round).toBe(1);
    expect(state?.extraData?.trackInfo).toEqual(mockTrackInfo);

    // Now process a new round where user1 is faster than user2 in round 1
    const roundResults2: UserRoundResult[] = [
      { userId: 'user1', scoreValue: 1, time: 1000, round: 2 } as UserRoundResult,
      { userId: 'user2', scoreValue: 1, time: 4000, round: 2 } as UserRoundResult,
    ];

    const newTrackInfo: TrackInfo = {
      url: '',
      gameCoverUrl: '',
      track: {
        game: 'GAME_B',
        title: 'Track B',
        audio: 'track002.mp3',
      },
    };

    achievements.processRound(roundResults2, newTrackInfo);

    state = achievements.achievements.get('fastestCorrectGuess');
    expect(state?.userIds).toEqual(['user1']);
    expect(state?.value).toBe(1000);
    expect(state?.extraData?.round).toBe(2); // Round number updated to round 2
    expect(state?.extraData?.trackInfo).toEqual(newTrackInfo); // Track info updated to new track

    // Now process a new round where no one beats the current fastest time
    const roundResults3: UserRoundResult[] = [
      { userId: 'user1', scoreValue: 1, time: 1500, round: 3 } as UserRoundResult,
      { userId: 'user2', scoreValue: 1, time: 2500, round: 3 } as UserRoundResult,
    ];

    const anotherTrackInfo: TrackInfo = {
      url: '',
      gameCoverUrl: '',
      track: {
        game: 'GAME_C',
        title: 'Track C',
        audio: 'track003.mp3',
      },
    };

    achievements.processRound(roundResults3, anotherTrackInfo);

    state = achievements.achievements.get('fastestCorrectGuess');
    expect(state?.userIds).toEqual(['user1']); // User remains the same
    expect(state?.value).toBe(1000); // Value remains the same
    expect(state?.extraData?.round).toBe(2); // Round number remains the same
    expect(state?.extraData?.trackInfo).toEqual(newTrackInfo); // Track info remains the same
  });
});
