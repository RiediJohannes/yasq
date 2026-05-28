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
  <svg width={size} height={size} viewBox="0 0 24 24" transform="translate(-0.5 -1)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={className}>
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

const SpyIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M16 9l.5-3c.2-1.5-1-2.5-4.5-2.5S7.3 4.5 7.5 6L8 9" />
    <path d="M3 11c4-2 14-2 18 0-1 1-8 2.5-10 2.5S4 12 3 11z" />
    <path d="M10 18c0 1.5-1.5 2.5-3 2.5S4 19.5 4 18s1-2.5 3-2.5 3 1 3 2.5z" />
    <path d="M20 18c0 1.5-1.5 2.5-3 2.5S14 19.5 14 18s1-2.5 3-2.5 3 1 3 2.5z" />
    <path d="M10 18h4" />
  </svg>
);
SpyIcon.jokerType = Joker.SPY;
SpyIcon.description = "Allows you to copy the answer of another player";

const GlimpseIcon = ({ size = 24, className = "" }) => (
  <svg width={size} height={size} viewBox="1 1 22 22" transform="scale(1.1 1.1)" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M5.89243 14.0598C5.29748 13.3697 5 13.0246 5 12C5 10.9754 5.29747 10.6303 5.89242 9.94021C7.08037 8.56222 9.07268 7 12 7C14.9273 7 16.9196 8.56222 18.1076 9.94021C18.7025 10.6303 19 10.9754 19 12C19 13.0246 18.7025 13.3697 18.1076 14.0598C16.9196 15.4378 14.9273 17 12 17C9.07268 17 7.08038 15.4378 5.89243 14.0598Z" stroke-width="1.5"></path>
    <circle cx="12" cy="12" r="2" stroke-width="1.5"></circle>
    <path d="M10 22C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 18.7712 2 15" stroke-width="1.5" stroke-linecap="round"></path>
    <path d="M22 15C22 18.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22" stroke-width="1.5" stroke-linecap="round"></path>
    <path d="M14 2C17.7712 2 19.6569 2 20.8284 3.17157C22 4.34315 22 5.22876 22 9" stroke-width="1.5" stroke-linecap="round"></path>
    <path d="M10 2C6.22876 2 4.34315 2 3.17157 3.17157C2 4.34315 2 5.22876 2 9" stroke-width="1.5" stroke-linecap="round"></path>
  </svg>
);
GlimpseIcon.jokerType = Joker.GLIMPSE;
GlimpseIcon.description = "Reveals a blurred image of the game's cover art"

export const ALL_JOKER_ICONS = [
  ObfuscationIcon,
  TriviaIcon,
  MultipleChoiceIcon,
  SpyIcon,
  GlimpseIcon,
];