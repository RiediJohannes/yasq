import type { UserRoundResult } from './leaderboard.js';
import { AchievementBonusType, type Track } from '@yasq/shared';

export enum AchievementBonusMetric {
  GUESS_TIME = 'guessTime',
  SCORE = 'score',
  TIME_BONUS = 'timeBonus',
  STREAK = 'streak',
}

export enum AchievementBonusFilter {
  CORRECT = 'correct',
  PARTIALLY_CORRECT = 'partially correct',
  INCORRECT = 'incorrect',
  ANY = 'any',
}

export enum AchievementBonusAggregate {
  AVERAGE = 'average',
  SUM = 'sum',
  MIN = 'min',
  MAX = 'max',
  COUNT = 'count',
}

export enum AchievementBonusGoal {
  HIGHEST = 'highest',
  LOWEST = 'lowest',
}

export const ACHIEVEMENT_BONUS_RULES: AchievementRule[] = [
  {
    id: AchievementBonusType.HIGHEST_STREAK,
    metric: AchievementBonusMetric.STREAK,
    goal: AchievementBonusGoal.HIGHEST,
    reward: 100,
  },
  {
    id: AchievementBonusType.FASTEST_CORRECT_GUESS,
    metric: AchievementBonusMetric.GUESS_TIME,
    filter: AchievementBonusFilter.CORRECT,
    aggregate: AchievementBonusAggregate.MIN,
    goal: AchievementBonusGoal.LOWEST,
    reward: 100,
  },
  {
    id: AchievementBonusType.MOST_PARTIALLY_CORRECT_GUESSES,
    metric: AchievementBonusMetric.SCORE,
    filter: AchievementBonusFilter.PARTIALLY_CORRECT,
    aggregate: AchievementBonusAggregate.COUNT,
    goal: AchievementBonusGoal.HIGHEST,
    reward: 100,
  },
  {
    id: AchievementBonusType.SLOWEST_AVERAGE_GUESS_TIME,
    metric: AchievementBonusMetric.GUESS_TIME,
    filter: AchievementBonusFilter.ANY,
    aggregate: AchievementBonusAggregate.AVERAGE,
    goal: AchievementBonusGoal.HIGHEST,
    reward: 100,
  },
];

export interface AchievementRule {
  id: AchievementBonusType | string;
  metric: AchievementBonusMetric;
  filter?: AchievementBonusFilter;
  aggregate?: AchievementBonusAggregate;
  goal: AchievementBonusGoal;
  reward?: number;
}

interface UserAccumulator {
  sum: number;
  count: number;
  min: number;
  max: number;
  latest: number;
}

export interface AchievementState {
  rule: AchievementRule;
  userIds: string[];
  value: number | null;
  userValues: Map<string, UserAccumulator | number>; // Holds user states right inside the achievement
  extraData?: any; // For storing things like track or roundResult references
}

export class AchievementBonusManager {
  // One single map containing all achievement definitions and their current state
  public achievements: Map<string, AchievementState> = new Map();

  constructor(rules: AchievementRule[]) {
    for (const rule of rules) {
      this.achievements.set(rule.id, {
        rule,
        userIds: [],
        value: null,
        userValues: new Map(),
      });
    }
  }

  // Updates direct metrics like streaks
  public updateMetric(
    userId: string,
    metric: AchievementBonusMetric,
    value: number,
    condition?: (current: number, incoming: number) => boolean
  ) {
    for (const state of this.achievements.values()) {
      if (state.rule.metric === metric && !state.rule.aggregate && !state.rule.filter) {
        if (condition) {
          const rawVal = state.userValues.get(userId) ?? 0;
          const currentVal = typeof rawVal === 'number' ? rawVal : rawVal.latest;

          if (!condition(currentVal, value)) {
            continue;
          }
        }
        state.userValues.set(userId, value);
        this.recalculateLeaders(state);
      }
    }
  }

  // Processes round results using the single unified map
  public processRound(roundResults: UserRoundResult[], track: Track) {
    for (const state of this.achievements.values()) {
      if (!state.rule.aggregate && !state.rule.filter) continue;

      // Accumulate round data into this achievement's internal user map
      for (const result of roundResults) {
        const userId = (result as any).userId;
        if (!userId) continue;

        if (!this.matchesFilter(result, state.rule.filter)) continue;
        const val = this.extractValue(result, state.rule.metric);
        if (val === null) continue;

        let acc = state.userValues.get(userId) as UserAccumulator;
        if (!acc) {
          acc = { sum: 0, count: 0, min: Infinity, max: -Infinity, latest: val };
          state.userValues.set(userId, acc);
        }

        acc.sum += val;
        acc.count += 1;
        acc.min = Math.min(acc.min, val);
        acc.max = Math.max(acc.max, val);
        acc.latest = val;
      }

      this.recalculateLeaders(state, roundResults, track);
    }
  }

  private matchesFilter(result: UserRoundResult, filter?: AchievementBonusFilter): boolean {
    if (!filter || filter === AchievementBonusFilter.ANY) return true;
    switch (filter) {
      case AchievementBonusFilter.CORRECT:
        return result.scoreValue === 1;
      case AchievementBonusFilter.PARTIALLY_CORRECT:
        return result.scoreValue > 0 && result.scoreValue < 1;
      case AchievementBonusFilter.INCORRECT:
        return result.scoreValue === 0;
      default:
        return true;
    }
  }

  private extractValue(result: UserRoundResult, metric: AchievementBonusMetric): number | null {
    if (metric === AchievementBonusMetric.GUESS_TIME) return result.time ?? null;
    if (metric === AchievementBonusMetric.SCORE) return result.scoreValue ?? null;
    return null;
  }

  private recalculateLeaders(state: AchievementState, roundResults?: UserRoundResult[], track?: Track) {
    let bestValue: number | null = null;
    let bestUserIds: string[] = [];

    for (const [userId, rawVal] of state.userValues.entries()) {
      let computedValue: number;

      if (typeof rawVal === 'number') {
        computedValue = rawVal;
      } else {
        const acc = rawVal as UserAccumulator;
        switch (state.rule.aggregate) {
          case AchievementBonusAggregate.SUM:
            computedValue = acc.sum;
            break;
          case AchievementBonusAggregate.AVERAGE:
            computedValue = acc.count > 0 ? acc.sum / acc.count : 0;
            break;
          case AchievementBonusAggregate.MIN:
            computedValue = acc.min === Infinity ? 0 : acc.min;
            break;
          case AchievementBonusAggregate.MAX:
            computedValue = acc.max === -Infinity ? 0 : acc.max;
            break;
          case AchievementBonusAggregate.COUNT:
            computedValue = acc.count;
            break;
          default:
            computedValue = acc.latest;
        }
      }

      if (bestValue === null) {
        bestValue = computedValue;
        bestUserIds = [userId];
      } else {
        const isBetter =
          state.rule.goal === AchievementBonusGoal.HIGHEST ? computedValue > bestValue : computedValue < bestValue;
        const isTie = computedValue === bestValue;

        if (isBetter) {
          bestValue = computedValue;
          bestUserIds = [userId];
        } else if (isTie) {
          bestUserIds.push(userId);
        }
      }
    }

    if (bestValue !== null) {
      state.value = bestValue;
      state.userIds = bestUserIds;
      if (track || roundResults) {
        state.extraData = {
          ...(track ? { track } : {}),
          ...(roundResults ? { round: roundResults[0]?.round } : {}),
        };
      }
    }
  }

  public static fromJSON(data: any): AchievementBonusManager {
    const manager = new AchievementBonusManager([]);

    if (data && typeof data === 'object') {
      const achievementsMap = new Map<string, AchievementState>();

      for (const [key, savedState] of Object.entries(data)) {
        if (!savedState) continue;
        const typedState = savedState as AchievementState;

        const ruleId = typedState.rule?.id || key;

        const userValuesMap = new Map<string, number | UserAccumulator>();
        if (typedState.userValues) {
          for (const [userId, val] of Object.entries(typedState.userValues)) {
            userValuesMap.set(String(userId), val as number | UserAccumulator);
          }
        }

        achievementsMap.set(ruleId, {
          rule: typedState.rule,
          userIds: Array.isArray(typedState.userIds) ? [...typedState.userIds] : [],
          value: typedState.value !== undefined ? typedState.value : null,
          userValues: userValuesMap,
          ...(typedState.extraData !== undefined ? { extraData: typedState.extraData } : {}),
        });
      }

      manager.achievements = achievementsMap;
    }

    return manager;
  }
}
