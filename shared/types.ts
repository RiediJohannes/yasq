import {
  BonusType,
  DEFAULT_FIRST_BONUS_MULTIPLIER,
  DEFAULT_ROUNDS,
  DEFAULT_STREAK_BONUS_MULTIPLIER,
  DEFAULT_TIME_BONUS,
  DEFAULT_TRACK_DURATION,
  FirstBonusMultiplier,
  Joker,
  StreakBonusMultiplier,
  TimeBonus
} from "@yasq/shared";

export interface Participant {
  id: string;
  username: string;
  nickname?: string;
  global_name?: string;
  avatar?: string;
}

export class GameSettings<T = Joker[]> {
  constructor(
    public rounds: number = DEFAULT_ROUNDS,
    public trackDuration: number = DEFAULT_TRACK_DURATION,
    public enabledJokers: T = [] as T,
    public firstBonusMultiplier: FirstBonusMultiplier = DEFAULT_FIRST_BONUS_MULTIPLIER,
    public timeBonus: TimeBonus | null = DEFAULT_TIME_BONUS,
    public streakBonusMultiplier: StreakBonusMultiplier = DEFAULT_STREAK_BONUS_MULTIPLIER,
  ) {}
}

export interface TimeBonusPoint {
  time: number;
  multiplier: number;
}

export interface PlayerTimeBonusPoint {
  playerId: string;
  time: number;
  multiplier: number | null;
  fullyCorrect: boolean;
}

export interface TimeBonusSummary {
  totalTime: number;
  curvePoints: TimeBonusPoint[];
  playerGuessTimes: PlayerTimeBonusPoint[]
}

export class PointsBonus {
  public type: BonusType;
  public multiplier: number;

  constructor(
    type: BonusType,
    multiplier: number,
  ) {
    this.type = type;
    // Truncate number to four decimal places to clip-off potential floating point noise
    this.multiplier = Math.round(multiplier * 10_000) / 10_000;
  }

  public toAbsolute(awardedBasePoints: number) {
    const fractionalBonus = awardedBasePoints * this.multiplier;
    return fractionalBonus > 0 && fractionalBonus < 1
      ? 1   // pity point so the bonus does not disappear entirely from the total points calculation
      : Math.round(fractionalBonus);
  }
}