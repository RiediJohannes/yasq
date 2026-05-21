import { Joker } from "@yasq/shared";

const ObfuscationIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={className}>
    <path d="M2 19L7 5L12 19M5 14H9" />
    <line x1="16" y1="19" x2="22" y2="19" />
  </svg>
);
ObfuscationIcon.jokerType = Joker.OBFUSCATION;
ObfuscationIcon.description = "Reveals the game title with most letters hidden by underscores"

const TriviaIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={className}>
    <circle cx="11" cy="11" r="7" />
    <line x1="22" y1="22" x2="16.65" y2="16.65" />
  </svg>
);
TriviaIcon.jokerType = Joker.TRIVIA;
TriviaIcon.description = "Reveals metadata about the game"

const MultipleChoiceIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={className}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
MultipleChoiceIcon.jokerType = Joker.MULTIPLE_CHOICE;
MultipleChoiceIcon.description = "Provides four game titles to choose from, with only one being the correct answer"

const SpyJokerIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M16 9l.5-3c.2-1.5-1-2.5-4.5-2.5S7.3 4.5 7.5 6L8 9" />
    <path d="M3 11c4-2 14-2 18 0-1 1-8 2.5-10 2.5S4 12 3 11z" />
    <path d="M10 18c0 1.5-1.5 2.5-3 2.5S4 19.5 4 18s1-2.5 3-2.5 3 1 3 2.5z" />
    <path d="M20 18c0 1.5-1.5 2.5-3 2.5S14 19.5 14 18s1-2.5 3-2.5 3 1 3 2.5z" />
    <path d="M10 18h4" />
  </svg>
);
SpyJokerIcon.jokerType = Joker.SPY;
SpyJokerIcon.description = "Allows you to copy the answer of another player";

export const ALL_JOKER_ICONS = [
  ObfuscationIcon,
  TriviaIcon,
  MultipleChoiceIcon,
  SpyJokerIcon
];