import { signal } from '@preact/signals';

import { GameState } from '@yasq/shared';
import { gameState } from '../main';
import { WithTooltip } from './Tooltip';

export const isLocalSettingsOpen = signal(false);
export const isHowToPlayOpen = signal(false);

export const GameHeader = () => {
  const { state, currentRound, gameSettings } = gameState.value;

  const renderHeaderContent = () => {
    switch (state) {
      case GameState.TRACK_SELECTION:
      case GameState.PLAYING:
      case GameState.HOST_REVIEW:
      case GameState.ROUND_RESULTS:
        return `Round ${currentRound} of ${gameSettings.rounds}`;
      default:
        return 'YASQ';
    }
  };

  return (
    <header className="game-header-stats">
      <p className="round-indicator">{renderHeaderContent()}</p>
      <div className="header-buttons">
        <WithTooltip text="How to Play">
          <button
            type="button"
            id="how-to-play-btn"
            className="header-btn"
            onClick={() => (isHowToPlayOpen.value = true)}
          >
            ❔
          </button>
        </WithTooltip>
        <WithTooltip text="Local Settings">
          <button
            type="button"
            id="local-settings-btn"
            className="header-btn"
            onClick={() => (isLocalSettingsOpen.value = true)}
          >
            ⚙️
          </button>
        </WithTooltip>
      </div>
    </header>
  );
};
