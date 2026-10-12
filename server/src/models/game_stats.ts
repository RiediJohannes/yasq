import type { UserRoundResult } from './leaderboard.js';
import { BASE_POINTS, BonusType, type Track } from '@yasq/shared';

export class GameStats {
  public startTime: number | null = null;
  public endTime: number | null = null;
  public bestScoringRound: { roundResults: UserRoundResult[]; track: Track; timeBonusSum: number } | null = null;
  public leastScoringRound: { roundResults: UserRoundResult[]; track: Track; timeBonusSum: number } | null = null;

  constructor() {}

  private calculateTimeBonusSum(roundResults: UserRoundResult[]): number {
    return roundResults.reduce((sum, result) => {
      const timeBonus = result.awardedBonuses?.find(b => b.type === BonusType.TIME_BONUS);
      if (!timeBonus) return sum;

      const basePoints = BASE_POINTS * result.scoreValue;
      return sum + timeBonus.toAbsolute(basePoints);
    }, 0);
  }

  public updateBestScoringRound(roundResults: UserRoundResult[], track: Track) {
    const totalTimeBonus = this.calculateTimeBonusSum(roundResults);
    const currentBest = this.bestScoringRound ? this.calculateTimeBonusSum(this.bestScoringRound.roundResults) : 0;

    if (!this.bestScoringRound || totalTimeBonus > currentBest) {
      this.bestScoringRound = { roundResults, track, timeBonusSum: totalTimeBonus };
    }
  }

  public updateLeastScoringRound(roundResults: UserRoundResult[], track: Track) {
    const totalTimeBonus = this.calculateTimeBonusSum(roundResults);
    const currentLeast = this.leastScoringRound
      ? this.calculateTimeBonusSum(this.leastScoringRound.roundResults)
      : Infinity;

    if (!this.leastScoringRound || totalTimeBonus < currentLeast) {
      this.leastScoringRound = { roundResults, track, timeBonusSum: totalTimeBonus };
    }
  }
}
