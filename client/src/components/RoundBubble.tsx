import { RoundResult } from '../utils/types';
import { TooltipDiv } from './Tooltip';

interface RoundBubblesGroupProps {
  rounds: RoundResult[];
  userId: string;
}

export const RoundBubblesGroup = ({ rounds, userId }: RoundBubblesGroupProps) => {
  return (
    <div className="round-bubbles">
      {rounds.map(r => (
        <RoundBubble
          key={r.round}
          roundResult={r}
          userId={userId}
        />
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
  const optionalRoundPrefix = roundResult.round ? `Round ${roundResult.round}: ` : '';
  const tooltipContent = `${optionalRoundPrefix}${roundResult.guess || 'No guess'}`;
  const statusClass =
    roundResult.scoreValue > 0.5 ? 'correct' : roundResult.scoreValue === 0.5 ? 'partial' : 'incorrect';

  return (
    <TooltipDiv
      id={tooltipId}
      text={tooltipContent}
      className={`round-bubble ${statusClass} ${roundResult.isFirst ? 'first' : ''}`}
    >
      {roundResult.points}
    </TooltipDiv>
  );
};
