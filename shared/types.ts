import {
  type AchievementBonuses,
  AchievementBonusMode,
  AchievementBonusType,
  BonusType,
  DEFAULT_ENABLED_JOKERS,
  DEFAULT_FIRST_BONUS_MULTIPLIER,
  DEFAULT_MAX_GUESS_TIME,
  DEFAULT_ROUNDS,
  DEFAULT_STREAK_BONUS_MULTIPLIER,
  DEFAULT_TIME_BONUS,
  FirstBonusMultiplier,
  GamePhase,
  Joker,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';

export interface Participant {
  id: string;
  username: string;
  nickname?: string;
  global_name?: string;
  avatar?: string;
}

export interface Tag {
  type: string;
  value: string;
}

export interface Track {
  game: string;
  title: string;
  audio: string;
  cover: string;
  tags: Tag[];
}

export interface TrackInfo {
  url: string;
  track: Track;
  gameCoverUrl: string;
}

export interface Playlist {
  name: string;
  tracks: string[];
}

export class GameSettings<T extends Iterable<Joker>> {
  public rounds: number;
  public maxGuessTime: number;
  public enabledJokers: T;
  public firstBonusMultiplier: FirstBonusMultiplier;
  public timeBonus: TimeBonus | null;
  public streakBonusMultiplier: StreakBonusMultiplier;
  public achievementBonuses?: AchievementBonuses | undefined;

  private constructor(options: Partial<GameSettings<T>> = {}) {
    this.rounds = options.rounds ?? DEFAULT_ROUNDS;
    this.maxGuessTime = options.maxGuessTime ?? DEFAULT_MAX_GUESS_TIME;
    this.enabledJokers = options.enabledJokers as T;
    this.firstBonusMultiplier = options.firstBonusMultiplier ?? DEFAULT_FIRST_BONUS_MULTIPLIER;
    this.timeBonus = options.timeBonus ?? DEFAULT_TIME_BONUS;
    this.streakBonusMultiplier = options.streakBonusMultiplier ?? DEFAULT_STREAK_BONUS_MULTIPLIER;
    this.achievementBonuses = options.achievementBonuses ?? {
      mode: AchievementBonusMode.MANUAL,
      enabledTypes: Object.values(AchievementBonusType),
      randomCount: 1,
    };
  }

  static withJokerArray(options: Partial<GameSettings<Joker[]>> = {}): GameSettings<Joker[]> {
    return new GameSettings({
      ...options,
      enabledJokers: options.enabledJokers ?? DEFAULT_ENABLED_JOKERS,
    });
  }

  static withJokerSet(options: Partial<GameSettings<Set<Joker>>> = {}): GameSettings<Set<Joker>> {
    return new GameSettings({
      ...options,
      enabledJokers: options.enabledJokers ?? new Set(DEFAULT_ENABLED_JOKERS),
    });
  }
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
  playerGuessTimes: PlayerTimeBonusPoint[];
}

export class PointsBonus {
  public type: BonusType;
  public multiplier: number;

  constructor(type: BonusType, multiplier: number) {
    this.type = type;
    // Truncate number to four decimal places to clip-off potential floating point noise
    this.multiplier = Math.round(multiplier * 10_000) / 10_000;
  }

  public toAbsolute(awardedBasePoints: number) {
    const fractionalBonus = awardedBasePoints * this.multiplier;
    return fractionalBonus > 0 && fractionalBonus < 1
      ? 1 // pity point so the bonus does not disappear entirely from the total points calculation
      : Math.round(fractionalBonus);
  }
}

export interface GameStatus {
  state: {
    game: number;
    round: number;
    phase: GamePhase;
    playback: Playback | null;
  };
  hostId: string | null;
  readyPlayers: string[];
  guessedPlayers: string[];
  lastWinnerId: string | null;
  streaks: Record<string, number>;
  lostStreaks: Record<string, number>;
  settings: GameSettings<Joker[]>;
}

export interface Playback {
  game: number;
  round: number;
  startTime: number;
  endTime: number;
}
