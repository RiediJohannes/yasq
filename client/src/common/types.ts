import { Joker, PointsBonus, Tag, TimeBonus } from '@yasq/shared';
import { CSSProperties } from 'preact';

/** Extension of the {@link TimeBonus} enum for selection in the UI */
export const OptionalTimeBonus = {
  ...TimeBonus,
  NONE: 'NONE',
} as const;

// Derive TypeScript type from the runtime object
export type TOptionalTimeBonus = (typeof OptionalTimeBonus)[keyof typeof OptionalTimeBonus];

export interface Track {
  game: string;
  title: string;
  audio: string;
  cover: string;
  played: boolean;
  tags: Tag[];
  originalIndex?: number;
}

export interface ReviewData {
  round: number;
  answer: string;
  guesses: Record<string, { text: string; joker: Joker }>;
  timedOut: string[];
}

export interface RoundResult {
  round?: number;
  scoreValue: number;
  points: number;
  guess?: string;
  isFirst?: boolean;
  awardedBonuses?: PointsBonus[];
}

export type CommonCSSProperties = {
  [K in keyof CSSProperties as string extends K ? never : number extends K ? never : K]: CSSProperties[K];
};
