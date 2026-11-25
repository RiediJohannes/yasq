import { MatcherReturnType } from '@playwright/test';

export interface MatchError extends Error {
  matcherResult?: MatcherReturnType;
}
