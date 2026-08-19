import { Joker } from '@yasq/shared';

const ObfuscationIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    className={className}
  >
    <path d="M2 19L7 5L12 19M5 14H9" />
    <line
      x1="16"
      y1="19"
      x2="22"
      y2="19"
    />
  </svg>
);
ObfuscationIcon.jokerType = Joker.OBFUSCATION;
ObfuscationIcon.description = 'Reveals the game title with most letters hidden by underscores';

const TriviaIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    transform="translate(-0.5 -1)"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    className={className}
  >
    <circle
      cx="11"
      cy="11"
      r="7"
    />
    <line
      x1="22"
      y1="22"
      x2="16.65"
      y2="16.65"
    />
  </svg>
);
TriviaIcon.jokerType = Joker.TRIVIA;
TriviaIcon.description = 'Reveals metadata about the game';

const MultipleChoiceIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    className={className}
  >
    <rect
      x="3"
      y="3"
      width="7"
      height="7"
      rx="1"
    />
    <rect
      x="14"
      y="3"
      width="7"
      height="7"
      rx="1"
      fill="currentColor"
    />
    <rect
      x="3"
      y="14"
      width="7"
      height="7"
      rx="1"
    />
    <rect
      x="14"
      y="14"
      width="7"
      height="7"
      rx="1"
    />
  </svg>
);
MultipleChoiceIcon.jokerType = Joker.MULTIPLE_CHOICE;
MultipleChoiceIcon.description = 'Provides four game titles to choose from, with only one being the correct answer';

const SpyIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 9l.5-3c.2-1.5-1-2.5-4.5-2.5S7.3 4.5 7.5 6L8 9" />
    <path d="M3 11c4-2 14-2 18 0-1 1-8 2.5-10 2.5S4 12 3 11z" />
    <path d="M10 18c0 1.5-1.5 2.5-3 2.5S4 19.5 4 18s1-2.5 3-2.5 3 1 3 2.5z" />
    <path d="M20 18c0 1.5-1.5 2.5-3 2.5S14 19.5 14 18s1-2.5 3-2.5 3 1 3 2.5z" />
    <path d="M10 18h4" />
  </svg>
);
SpyIcon.jokerType = Joker.SPY;
SpyIcon.description = 'Allows you to copy the answer of another player';

/**
 * Eye Scan SVG Icon
 * Author: Solar Icons
 * Source: https://www.svgrepo.com/svg/524042/eye-scan
 * License: CC Attribution License
 */
const GlimpseIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="1 1 22 22"
    transform="scale(1.1 1.1)"
    fill="none"
    stroke="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M5.89243 14.0598C5.29748 13.3697 5 13.0246 5 12C5 10.9754 5.29747 10.6303 5.89242 9.94021C7.08037 8.56222 9.07268 7 12 7C14.9273 7 16.9196 8.56222 18.1076 9.94021C18.7025 10.6303 19 10.9754 19 12C19 13.0246 18.7025 13.3697 18.1076 14.0598C16.9196 15.4378 14.9273 17 12 17C9.07268 17 7.08038 15.4378 5.89243 14.0598Z"
      stroke-width="1.5"
    ></path>
    <circle
      cx="12"
      cy="12"
      r="2"
      stroke-width="1.5"
    ></circle>
    <path
      d="M10 22C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 18.7712 2 15"
      stroke-width="1.5"
      stroke-linecap="round"
    ></path>
    <path
      d="M22 15C22 18.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22"
      stroke-width="1.5"
      stroke-linecap="round"
    ></path>
    <path
      d="M14 2C17.7712 2 19.6569 2 20.8284 3.17157C22 4.34315 22 5.22876 22 9"
      stroke-width="1.5"
      stroke-linecap="round"
    ></path>
    <path
      d="M10 2C6.22876 2 4.34315 2 3.17157 3.17157C2 4.34315 2 5.22876 2 9"
      stroke-width="1.5"
      stroke-linecap="round"
    ></path>
  </svg>
);
GlimpseIcon.jokerType = Joker.GLIMPSE;
GlimpseIcon.description = "Reveals a blurred image of the game's cover art";

export const ALL_JOKER_ICONS = [ObfuscationIcon, TriviaIcon, MultipleChoiceIcon, SpyIcon, GlimpseIcon];

export const InfoIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M11 10.9794C11 10.4271 11.4477 9.97937 12 9.97937C12.5523 9.97937 13 10.4271 13 10.9794V16.9794C13 17.5317 12.5523 17.9794 12 17.9794C11.4477 17.9794 11 17.5317 11 16.9794V10.9794Z"
      fill="currentColor"
    />
    <path
      d="M12 6.05115C11.4477 6.05115 11 6.49886 11 7.05115C11 7.60343 11.4477 8.05115 12 8.05115C12.5523 8.05115 13 7.60343 13 7.05115C13 6.49886 12.5523 6.05115 12 6.05115Z"
      fill="currentColor"
    />
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12Z"
      fill="currentColor"
    />
  </svg>
);

export const CrossIcon = ({ size = 24, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 1024 1024"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      fill="currentColor"
      d="M195.2 195.2a64 64 0 0 1 90.496 0L512 421.504 738.304 195.2a64 64 0 0 1 90.496 90.496L602.496 512 828.8 738.304a64 64 0 0 1-90.496 90.496L512 602.496 285.696 828.8a64 64 0 0 1-90.496-90.496L421.504 512 195.2 285.696a64 64 0 0 1 0-90.496z"
    />
  </svg>
);
