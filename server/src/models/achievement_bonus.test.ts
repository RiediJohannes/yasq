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
import type { Track } from '@yasq/shared';

const SAMPLE_TRACK = {
  game: 'GAME_A',
  title: 'Track A',
  audio: 'track001.mp3',
  cover: 'game_a.png',
  tags: [
    { type: 'Publisher', value: 'Publisher A' },
    { type: 'Genre', value: 'Genre A' },
  ],
} satisfies Track;

describe('AchievementBonusManager', () => {
  let rules: AchievementRule[];
  let achievements: AchievementBonusManager;
  let mockTrack: Track;

  beforeEach(() => {
    rules = [
      {
        id: 'highestStreak',
        metric: AchievementBonusMetric.STREAK,
        goal: AchievementBonusGoal.HIGHEST,
        reward: 100,
      },
      {
        id: 'fastestAverageGuess',
        metric: AchievementBonusMetric.GUESS_TIME,
        filter: AchievementBonusFilter.CORRECT,
        aggregate: AchievementBonusAggregate.AVERAGE,
        goal: AchievementBonusGoal.LOWEST,
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
    ];

    achievements = new AchievementBonusManager(rules);
    mockTrack = SAMPLE_TRACK;
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

    achievements.processRound(round1, mockTrack);
    achievements.processRound(round2, mockTrack);

    // user1 averages: (2000 + 1000) / 2 = 1500
    // user2 averages: (4000 + 2000) / 2 = 3000
    // Goal is lowest average guess time -> user1 wins
    const state = achievements.achievements.get('fastestAverageGuess');
    expect(state?.userIds).toEqual(['user1']);
    expect(state?.value).toBe(1500);
  });

  it('should respect filters (e.g., only counting correct guesses)', () => {
    const roundResults: UserRoundResult[] = [
      { userId: 'user1', scoreValue: 0, time: 500 } as UserRoundResult, // Incorrect, should be filtered out for fastestAverageGuess
      { userId: 'user1', scoreValue: 1, time: 3000 } as UserRoundResult, // Correct
      { userId: 'user2', scoreValue: 1, time: 2000 } as UserRoundResult, // Correct
    ];

    achievements.processRound(roundResults, mockTrack);

    // user1 valid time: 3000 (avg = 3000)
    // user2 valid time: 2000 (avg = 2000)
    const state = achievements.achievements.get('fastestAverageGuess');
    expect(state?.userIds).toEqual(['user2']);
    expect(state?.value).toBe(2000);
  });

  it('should count occurrences correctly for COUNT aggregate', () => {
    const roundResults: UserRoundResult[] = [
      { userId: 'user1', scoreValue: 0.5 } as UserRoundResult, // Partially correct
      { userId: 'user1', scoreValue: 0.5 } as UserRoundResult, // Partially correct
      { userId: 'user2', scoreValue: 0.5 } as UserRoundResult, // Partially correct
      { userId: 'user2', scoreValue: 1 } as UserRoundResult, // Correct, should be filtered out for mostPartiallyCorrectGuesses
    ];

    achievements.processRound(roundResults, mockTrack);

    const state = achievements.achievements.get('mostPartiallyCorrectGuesses');
    expect(state?.userIds).toEqual(['user1']);
    expect(state?.value).toBe(2); // user1 has 2 partially correct guesses
  });
});
