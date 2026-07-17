import { useId } from "preact/hooks";
import { useExclusiveTooltip } from "../hooks/useExclusiveTooltip";
import { NonDraggableImg } from "./NonDraggableImg";

interface DiscordAvatarProps {
  src: string;
  userName: string;
  tiny?: boolean
}

// Discord avatar image with alt-text but no tooltip logic
export const DiscordAvatar = ({ src, userName, tiny = false }: DiscordAvatarProps) => {
  const cssClass = tiny ? "avatar-tiny" : "avatar-small";
  return <NonDraggableImg src={src} alt={`Avatar of ${userName}`} className={cssClass} />;
};


interface DiscordAvatarWithTooltipProps extends DiscordAvatarProps {
  userId: string;
}

// Discord avatar image extended by a dynamic custom tooltip
export const DiscordAvatarWithTooltip = ({ src, userName, tiny = false, userId }: DiscordAvatarWithTooltipProps) => {
  const { activeTooltipId, setActiveTooltipId } = useExclusiveTooltip();
  const instanceId = useId();

  const tooltipId = `avatar-${userId}-${instanceId}`;
  const isTooltipOpen = activeTooltipId === tooltipId;

  const measureBounds = (el: HTMLDivElement) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--trigger-x', `${rect.left}px`);
    const computedStyle = window.getComputedStyle(el, '::after');
    el.style.setProperty('--tooltip-width', computedStyle.width);
  };

  // Wrap the basic DiscordAvatar component in a container that adds a reactive tooltip
  return (
    <div
      className={`discord-avatar-wrapper has-tooltip ${isTooltipOpen ? "show-tooltip" : ""}`}
      data-tooltip={userName}
      onMouseEnter={(e) => {
        measureBounds(e.currentTarget as HTMLDivElement);
        setActiveTooltipId(tooltipId);
      }}
      onMouseLeave={() => {
        if (activeTooltipId === tooltipId) setActiveTooltipId(null);
      }}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        measureBounds(e.currentTarget as HTMLDivElement);
        setActiveTooltipId(isTooltipOpen ? null : tooltipId);
      }}
    >
      <DiscordAvatar src={src} userName={userName} tiny={tiny} />
    </div>
  );
};