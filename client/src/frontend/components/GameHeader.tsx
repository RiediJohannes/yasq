import { signal } from '@preact/signals';

import { GamePhase, IN_GAME_PHASES } from '@yasq/shared';
import { gameStatus } from '@globals';
import { WithTooltip } from './Tooltip';

export const isGameSettingsOpen = signal(false);
export const isHowToPlayOpen = signal(false);
export const isLocalSettingsOpen = signal(false);

export const GameHeader = () => {
  const { state, settings } = gameStatus.value;

  const renderHeaderContent = () => {
    return IN_GAME_PHASES.has(state.phase) ? `Round ${state.round} of ${settings.rounds}` : 'YASQ';
  };

  const showGameSettings = IN_GAME_PHASES.has(state.phase) || state.phase === GamePhase.FINAL_RESULTS;

  return (
    <header
      id="game-header"
      className="game-header-stats"
    >
      <div className="header-buttons left">
        {showGameSettings && (
          <WithTooltip text="Game Settings">
            <button
              type="button"
              id="game-settings-btn"
              className="header-btn"
              onClick={() => (isGameSettingsOpen.value = true)}
            >
              📋
            </button>
          </WithTooltip>
        )}
      </div>
      <p
        id="header-title"
        className="round-indicator"
      >
        {renderHeaderContent()}
      </p>
      <div className="header-buttons right">
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
