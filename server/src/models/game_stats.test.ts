import { beforeEach, describe, expect, it } from 'vitest';

import { GameStats } from './game_stats.js';
import type { UserRoundResult } from './leaderboard.js';
import { BonusType, PointsBonus, type TrackInfo } from '@yasq/shared';

describe('GameStats', () => {
  let stats: GameStats;
  const mockTrackInfo = {} as TrackInfo;

  beforeEach(() => {
    stats = new GameStats();
  });

  describe('Best Scoring Round', () => {
    it('should track the round with the highest combined time bonus', () => {
      expect(stats.bestScoringRound).toBeNull();

      const roundA = [
        { userId: 'user-1', scoreValue: 1, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.5)] },
        { userId: 'user-2', scoreValue: 0.5, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.3)] },
      ] as UserRoundResult[];
      const roundB = [
        { userId: 'user-1', scoreValue: 1, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.9)] },
        { userId: 'user-2', scoreValue: 1, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.4)] },
      ] as UserRoundResult[];
      const roundC = [
        { userId: 'user-1', scoreValue: 1, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.7)] },
        { userId: 'user-2', scoreValue: 0.5, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.3)] },
      ] as UserRoundResult[];

      stats.updateBestScoringRound(roundA, mockTrackInfo);
      expect(stats.bestScoringRound?.roundResults).toEqual(roundA);
      expect(stats.bestScoringRound?.timeBonusSum).toBe(215); // (100 + 50) + (50 + 15)

      // Higher combined time bonus replaces it
      stats.updateBestScoringRound(roundB, mockTrackInfo);
      expect(stats.bestScoringRound?.roundResults).toEqual(roundB);
      expect(stats.bestScoringRound?.timeBonusSum).toBe(330); // (100 + 90) + (100 + 40)

      // Lower combined time bonus does not replace the best
      stats.updateBestScoringRound(roundC, mockTrackInfo);
      expect(stats.bestScoringRound?.roundResults).toEqual(roundB);
    });

    it('should only count base points if no time bonus found', () => {
      const roundA = [
        { userId: 'user-1', scoreValue: 1 },
        { userId: 'user-2', scoreValue: 0.5 },
      ] as UserRoundResult[];
      const roundB = [
        { userId: 'user-1', scoreValue: 1 },
        { userId: 'user-2', scoreValue: 1 },
      ] as UserRoundResult[];
      const roundC = [
        { userId: 'user-1', scoreValue: 1 },
        { userId: 'user-2', scoreValue: 0 },
      ] as UserRoundResult[];

      stats.updateBestScoringRound(roundA, mockTrackInfo);
      expect(stats.bestScoringRound?.roundResults).toEqual(roundA);
      expect(stats.bestScoringRound?.timeBonusSum).toBe(150); // 100 + 50

      // Higher combined time bonus replaces it
      stats.updateBestScoringRound(roundB, mockTrackInfo);
      expect(stats.bestScoringRound?.roundResults).toEqual(roundB);
      expect(stats.bestScoringRound?.timeBonusSum).toBe(200); // 100 + 100

      // Lower combined time bonus does not replace the best
      stats.updateBestScoringRound(roundC, mockTrackInfo);
      expect(stats.bestScoringRound?.roundResults).toEqual(roundB);
    });
  });

  describe('Least Scoring Round', () => {
    it('should track the round with the lowest combined time bonus', () => {
      expect(stats.leastScoringRound).toBeNull();

      const roundA = [
        { userId: 'user-1', scoreValue: 1, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.9)] },
        { userId: 'user-2', scoreValue: 1, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.4)] },
      ] as UserRoundResult[];
      const roundB = [
        { userId: 'user-1', scoreValue: 1, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.5)] },
        { userId: 'user-2', scoreValue: 0.5, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.3)] },
      ] as UserRoundResult[];
      const roundC = [
        { userId: 'user-1', scoreValue: 1, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.7)] },
        { userId: 'user-2', scoreValue: 0.5, awardedBonuses: [new PointsBonus(BonusType.TIME_BONUS, 0.3)] },
      ] as UserRoundResult[];

      stats.updateLeastScoringRound(roundA, mockTrackInfo);
      expect(stats.leastScoringRound?.roundResults).toEqual(roundA);
      expect(stats.leastScoringRound?.timeBonusSum).toBe(330); // (100 + 90) + (100 + 40)

      // Lower combined time bonus replaces it
      stats.updateLeastScoringRound(roundB, mockTrackInfo);
      expect(stats.leastScoringRound?.roundResults).toEqual(roundB);
      expect(stats.leastScoringRound?.timeBonusSum).toBe(215); // (100 + 50) + (50 + 15)

      // Higher combined time bonus does not replace the lowest
      stats.updateLeastScoringRound(roundC, mockTrackInfo);
      expect(stats.leastScoringRound?.roundResults).toEqual(roundB);
    });
  });
});
