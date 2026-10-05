import { RoundResult } from '../../common/types';
import { TooltipDiv } from './Tooltip';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';

interface RoundBubblesGroupProps {
  rounds: RoundResult[];
  userId: string;
}

export const RoundBubblesGroup = ({ rounds, userId }: RoundBubblesGroupProps) => {
  const { getTabProps, handleKeyDown } = useRovingTabIndex(rounds.length);

  return (
    <div className="round-bubbles">
      {rounds.map((r, index) => (
        <RoundBubble
          key={r.round ?? index}
          roundResult={r}
          userId={userId}
          {...getTabProps(index)}
          onKeyDown={e => handleKeyDown(e, index)}
        />
      ))}
    </div>
  );
};

interface RoundBubbleProps {
  roundResult: RoundResult;
  userId: string;
  elementRef?: (el: HTMLElement | null) => void;
  tabIndex?: number;
  onFocus?: () => void;
  onKeyDown?: (e: KeyboardEvent) => void;
}

export const RoundBubble = ({ roundResult, userId, elementRef, tabIndex, onFocus, onKeyDown }: RoundBubbleProps) => {
  const tooltipId = roundResult.round ? `round-${userId}-${roundResult.round}` : `user-${userId}`;
  const optionalRoundPrefix = roundResult.round ? `Round ${roundResult.round}: ` : '';
  const tooltipContent = `${optionalRoundPrefix}${roundResult.guess || 'No guess'}`;
  const statusClass =
    roundResult.scoreValue > 0.5 ? 'correct' : roundResult.scoreValue === 0.5 ? 'partial' : 'incorrect';

  return (
    <TooltipDiv
      id={tooltipId}
      text={tooltipContent}
      className={`round-bubble ${statusClass} ${roundResult.isFirst ? 'first' : ''}`}
      elementRef={elementRef}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      {roundResult.points}
    </TooltipDiv>
  );
};
