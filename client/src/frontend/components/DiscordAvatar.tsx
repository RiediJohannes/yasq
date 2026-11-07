import { NonDraggableImg } from './NonDraggableImg';
import { TooltipDiv } from './Tooltip';
import { getStreakTier } from '../../utils/helper';

interface DiscordAvatarProps extends DiscordAvatarInnerProps {
  streak?: number;
}

interface DiscordAvatarInnerProps {
  src: string;
  userName: string;
  tiny?: boolean;
  hasTooltip?: boolean;
  className?: string;
}

/**
 * Discord avatar image with alt-text and optional streak badge and custom tooltip.
 */
export const DiscordAvatar = ({
  src,
  userName,
  streak = 0,
  tiny = false,
  hasTooltip = false,
  className = '',
}: DiscordAvatarProps) => {
  return streak > 0 ? (
    <span className="badged-player">
      <DiscordAvatarInner
        src={src}
        userName={userName}
        tiny={tiny}
        hasTooltip={hasTooltip}
        className={className}
      />
      <span className={`avatar-badge streak-tier-${getStreakTier(streak)}`}>{streak}</span>
    </span>
  ) : (
    <DiscordAvatarInner
      src={src}
      userName={userName}
      tiny={tiny}
      hasTooltip={hasTooltip}
      className={className}
    />
  );
};

const DiscordAvatarInner = ({
  src,
  userName,
  tiny = false,
  hasTooltip = false,
  className = '',
}: DiscordAvatarInnerProps) => {
  const cssClass = tiny ? 'avatar-tiny' : 'avatar-small';
  const discordAvatarHtml = (
    <NonDraggableImg
      src={src}
      alt={`Avatar of ${userName}`}
      className={`${cssClass} ${className}`}
    />
  );

  return hasTooltip ? <TooltipDiv text={userName}>{discordAvatarHtml}</TooltipDiv> : discordAvatarHtml;
};
