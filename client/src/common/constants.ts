import { TimeBonus } from '@yasq/shared';
import { TOptionalTimeBonus } from './types';

export const PLAYER_TIME_BONUS_LABELS: Record<TOptionalTimeBonus, string> = {
  [TimeBonus.LINEAR]: '⏳ Steady Pace',
  [TimeBonus.EXPONENTIAL]: '🔥 Quick Fire',
  [TimeBonus.LOGISTIC]: '⚖️ Balanced',
  NONE: '❌ No time bonus',
};

export const HOST_TIME_BONUS_LABELS: Record<TOptionalTimeBonus, string> = {
  [TimeBonus.LINEAR]: PLAYER_TIME_BONUS_LABELS[TimeBonus.LINEAR] + ' (linear)',
  [TimeBonus.EXPONENTIAL]: PLAYER_TIME_BONUS_LABELS[TimeBonus.EXPONENTIAL] + ' (exponential)',
  [TimeBonus.LOGISTIC]: PLAYER_TIME_BONUS_LABELS[TimeBonus.LOGISTIC] + ' (logistic)',
  NONE: '❌ No time bonus',
};
