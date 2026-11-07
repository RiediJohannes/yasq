/**
 * Data containers used exclusively to encapsulate data sent between server and client.
 * In contrast to the definitions in `shared/types.ts`, these types may differ from the data representation used
 * for the domain models on the server.
 */

import { type AchievementBonusType } from './constants.js';
import type { PointsBonus, Tag, TimeBonusSummary, TrackInfo } from './types.js';

export type Fallible<T> = { ok: false; error: string } | ({ ok: true } & T);

export interface RoundResultDto {
  round: number;
  guess?: string | undefined;
  points: number;
  scoreValue: number;
  isFirst: boolean;
  awardedBonuses: PointsBonus[];
}

export interface RoundSummaryDto {
  round: number;
  timeBonusSummary: TimeBonusSummary | null;
}

export interface RoundDataDto {
  round: number;
  result: RoundResultDto[];
  summary: RoundSummaryDto | null;
  correctPlayers: string[];
  lostStreaks: Record<string, number>;
  correctAnswer: string | undefined;
  trackTitle: string | undefined;
  tags: Tag[];
  gameCover: string | undefined;
}

export interface UserRoundResultDto extends RoundResultDto {
  userId: string;
}

export interface RoundStatsDto {
  roundResults: UserRoundResultDto[];
  trackInfo: TrackInfo;
  timeBonusSum: number;
}

export interface LeaderboardEntryDto {
  userId: string;
  totalScore: number;
  roundHistory: RoundResultDto[];
  achievementBonuses: Map<AchievementBonusType, number>;
}

export interface GameStatsDto {
  startTime: number;
  endTime: number;
  bestScoringRound: RoundStatsDto | null;
  leastScoringRound: RoundStatsDto | null;
}

export interface AchievementStateDto {
  rule: AchievementRuleDto;
  userIds: string[];
  value: number | null;
  extraData?: any;
}

export interface AchievementRuleDto {
  id: AchievementBonusType;
  reward: number;
  metric: string;
  description: string;
  aggregate: string;
}

export interface FinalResultsResponse {
  leaderboard: LeaderboardEntryDto[];
  gameStats: GameStatsDto;
  achievementBonuses: Record<string, AchievementStateDto>;
  music: {
    loopUrl?: string | null | undefined;
    jingleUrl?: string | null | undefined;
  };
  canExport: boolean;
}
