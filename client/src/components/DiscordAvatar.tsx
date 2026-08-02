import { NonDraggableImg } from './NonDraggableImg';
import { TooltipDiv } from './Tooltip';

interface DiscordAvatarProps {
  src: string;
  userName: string;
  tiny?: boolean;
  hasTooltip?: boolean;
  className?: string;
}

// Discord avatar image with alt-text and optional custom tooltip
export const DiscordAvatar = ({
  src,
  userName,
  tiny = false,
  hasTooltip = false,
  className = '',
}: DiscordAvatarProps) => {
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
