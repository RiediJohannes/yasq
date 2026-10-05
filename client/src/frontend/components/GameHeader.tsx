import { signal } from '@preact/signals';

import { GamePhase } from '@yasq/shared';
import { gameStatus } from '@yasq/client/src/globals';
import { WithTooltip } from './Tooltip';

export const isLocalSettingsOpen = signal(false);
export const isHowToPlayOpen = signal(false);

export const GameHeader = () => {
  const { state, settings } = gameStatus.value;

  const renderHeaderContent = () => {
    switch (state.phase) {
      case GamePhase.TRACK_SELECTION:
      case GamePhase.PLAYING:
      case GamePhase.HOST_REVIEW:
      case GamePhase.ROUND_RESULTS:
        return `Round ${state.round} of ${settings.rounds}`;
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
