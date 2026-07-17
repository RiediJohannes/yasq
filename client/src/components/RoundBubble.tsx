import { RoundResult } from "../utils/types";
import { useExclusiveTooltip } from "../hooks/useExclusiveTooltip";

interface RoundBubblesGroupProps {
  rounds: RoundResult[];
  userId: string;
}

export const RoundBubblesGroup = ({ rounds, userId }: RoundBubblesGroupProps) => {
  return (
    <div className="round-bubbles">
      {rounds.map((r) => (
        <RoundBubble key={r.round} roundResult={r} userId={userId} />
      ))}
    </div>
  );
};


interface RoundBubbleProps {
  roundResult: RoundResult;
  userId: string;
}

export const RoundBubble = ({ roundResult, userId }: RoundBubbleProps) => {
  const tooltipId = roundResult.round ? `round-${userId}-${roundResult.round}` : `user-${userId}`;
  const { activeTooltipId, setActiveTooltipId } = useExclusiveTooltip();
  const isTooltipOpen = activeTooltipId === tooltipId;

  // Measure actual position and width of current bubble when tapped/hovered on
  const measureBounds = (el: HTMLDivElement) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--trigger-x', `${rect.left}px`);
    // Computed styles of the tooltip with a width dynamically adjusted to fit the text
    const computedStyle = window.getComputedStyle(el, '::after');
    el.style.setProperty('--tooltip-width', computedStyle.width);
  };

  const optionalRoundPrefix = roundResult.round ? `Round ${roundResult.round}: ` : '';
  const tooltipContent = `${optionalRoundPrefix}${roundResult.guess || 'No guess'}`;

  return (
    <div
      className={`round-bubble has-tooltip ${roundResult.scoreValue > 0 ? 'correct' : 'incorrect'} ${roundResult.isFirst ? 'first' : ''} ${isTooltipOpen ? "show-tooltip" : ""}`}
      data-tooltip={tooltipContent}
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
      {roundResult.points}
    </div>
  );
};