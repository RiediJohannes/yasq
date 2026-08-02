import { GameState } from '@yasq/shared';
import { gameState } from '../main';

export const GameHeader = () => {
  const { state, currentRound, gameSettings } = gameState.value;

  const renderHeaderContent = () => {
    switch (state) {
      case GameState.TRACK_SELECTION:
      case GameState.PLAYING:
      case GameState.ROUND_COMPLETED:
      case GameState.RESULTS:
        return `Round ${currentRound} of ${gameSettings.rounds}`;
      default:
        return 'YASQ';
    }
  };

  return (
    <div className="game-header-stats">
      <p className="round-indicator">{renderHeaderContent()}</p>
    </div>
  );
};
