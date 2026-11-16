import type { UserRoundResult } from './leaderboard.js';
import {
  AchievementBonusAggregate,
  AchievementBonusFilter,
  AchievementBonusGoal,
  AchievementBonusMetric,
  DEFAULT_ACHIEVEMENT_BONUS_RULES,
  type AchievementBonusRule,
  type TrackInfo,
} from '@yasq/shared';
import { getAppSettings } from '../config/settings.js';

export {
  AchievementBonusAggregate,
  AchievementBonusFilter,
  AchievementBonusGoal,
  AchievementBonusMetric,
} from '@yasq/shared';

export type AchievementRule = AchievementBonusRule;

export function getConfiguredAchievementBonusRules(): AchievementRule[] {
  const configuredRules = getAppSettings().achievementBonuses;
  return configuredRules ?? DEFAULT_ACHIEVEMENT_BONUS_RULES;
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
      this.achievements.set(rule.name, {
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
  public processRound(roundResults: UserRoundResult[], trackInfo: TrackInfo) {
    for (const state of this.achievements.values()) {
      if (!state.rule.aggregate && !state.rule.filter) continue;

      // Accumulate round data into this achievement's internal user map
      for (const result of roundResults) {
        const userId = result.userId;
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

      this.recalculateLeaders(state, roundResults, trackInfo);
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

  private recalculateLeaders(state: AchievementState, roundResults?: UserRoundResult[], trackInfo?: TrackInfo) {
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
      const previousValue = state.value;
      const isBetter =
        previousValue === null ||
        (state.rule.goal === AchievementBonusGoal.HIGHEST ? bestValue > previousValue : bestValue < previousValue);

      state.value = bestValue;
      state.userIds = bestUserIds;

      const aggregate = state.rule.aggregate;
      const isCumulative =
        aggregate !== undefined &&
        [AchievementBonusAggregate.SUM, AchievementBonusAggregate.COUNT, AchievementBonusAggregate.AVERAGE].includes(
          aggregate
        );

      if (!isCumulative && (trackInfo || roundResults) && isBetter) {
        state.extraData = {
          ...(trackInfo ? { trackInfo: trackInfo } : {}),
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

        const ruleId = typedState.rule?.name || key;

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
