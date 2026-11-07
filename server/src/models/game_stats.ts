import type { UserRoundResult } from './leaderboard.js';
import { BASE_POINTS, BonusType, type TrackInfo } from '@yasq/shared';

export interface RoundStats {
  roundResults: UserRoundResult[];
  trackInfo: TrackInfo;
  timeBonusSum: number;
}

export class GameStats {
  public startTime: number | null = null;
  public endTime: number | null = null;
  public bestScoringRound: RoundStats | null = null;
  public leastScoringRound: RoundStats | null = null;

  constructor() {}

  private calculateTimeBonusSum(roundResults: UserRoundResult[]): number {
    return roundResults.reduce((sum, result) => {
      const basePoints = BASE_POINTS * result.scoreValue;

      const timeBonus = result.awardedBonuses?.find(b => b.type === BonusType.TIME_BONUS);
      if (!timeBonus) return sum + basePoints;

      return sum + basePoints + timeBonus.toAbsolute(basePoints);
    }, 0);
  }

  public updateBestScoringRound(roundResults: UserRoundResult[], trackInfo: TrackInfo) {
    const totalTimeBonus = this.calculateTimeBonusSum(roundResults);
    const currentBest = this.bestScoringRound ? this.calculateTimeBonusSum(this.bestScoringRound.roundResults) : 0;

    if (!this.bestScoringRound || totalTimeBonus > currentBest) {
      this.bestScoringRound = { roundResults, trackInfo, timeBonusSum: totalTimeBonus };
    }
  }

  public updateLeastScoringRound(roundResults: UserRoundResult[], trackInfo: TrackInfo) {
    const totalTimeBonus = this.calculateTimeBonusSum(roundResults);
    const currentLeast = this.leastScoringRound
      ? this.calculateTimeBonusSum(this.leastScoringRound.roundResults)
      : Infinity;

    if (!this.leastScoringRound || totalTimeBonus < currentLeast) {
      this.leastScoringRound = { roundResults, trackInfo, timeBonusSum: totalTimeBonus };
    }
  }
}
