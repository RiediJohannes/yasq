export const enum GameState {
  SETUP = 'SETUP',
  LOBBY = 'LOBBY',
  TRACK_SELECTION = 'TRACK_SELECTION',
  PLAYING = 'PLAYING',
  ROUND_COMPLETED = 'ROUND_COMPLETED',
  RESULTS = 'RESULTS',
  GAME_FINISHED = 'GAME_FINISHED'
}

export const enum Joker {
  OBFUSCATION = 'OBFUSCATION',  // Cipher
  TRIVIA = 'TRIVIA',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  SPY = 'SPY',
  GLIMPSE = 'GLIMPSE',  // Blur, Peek
}

export enum FirstBonusMultiplier {
  OFF = 1.0,
  X1_1 = 1.1,
  X1_2 = 1.2,
  X1_3 = 1.3
}

export enum TimeBonus {
  /**
   * **Steady decay:**
   * Multiplier decreases linearly over time starting from the first successful answer.
   */
  LINEAR = 'LINEAR',
  /**
   * **Sharp decay:**
   * Multiplier decreases exponentially over time starting from the first successful answer.
   */
  EXPONENTIAL = 'EXPONENTIAL',
  /**
   * **Logistic decay:**
   * Multiplier follows a logistic/sigmoid curve over time starting from the first successful answer.
   */
  LOGISTIC = 'LOGISTIC',
}


export const MAX_VOLUME: number = 0.25;
export const DEFAULT_VOLUME_SLIDER_VAL: number = 0.5;
export const POLLING_INTERVAL: number = 500;

export const STATIC_FILES_DIR: string = 'data';
export const TEMP_FILES_DIR: string = 'temp';

export const COUNTDOWN_DURATION: number = 4000;
export const DEFAULT_TRACK_DURATION: number = 60_000;
export const DEFAULT_ROUNDS: number = 5;
export const DEFAULT_ENABLED_JOKERS: Joker[] = [Joker.OBFUSCATION, Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.SPY, Joker.GLIMPSE];

export const BASE_POINTS: number = 100;
export const MAX_TIME_MULTIPLIER: number = 2.0;
export const MIN_TIME_MULTIPLIER: number = 1.0;
export const EXPONENTIAL_DECAY_INTENSITY: number = 2.5;
export const DEFAULT_FIRST_BONUS_MULTIPLIER = FirstBonusMultiplier.X1_2;
export const DEFAULT_TIME_BONUS: TimeBonus = TimeBonus.LINEAR;

export const GLIMPSE_BLUR_INTENSITY: number = 25;

export const INT32_MAX_VALUE: number = 2**31 - 1;

export const WS_JOIN_INSTANCE_EVENT: string = 'join_instance';
export const WS_GAME_STATUS_UPDATE_EVENT: string = 'game_status_update';

export const UI_UPDATES_DELAY_IN_E2E: number = 1000;