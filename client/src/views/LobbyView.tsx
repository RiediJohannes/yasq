import { useEffect, useState } from 'preact/hooks';

import * as backend from '../utils/backend';
import { auth, discordSdk, gameState, participants } from '../main';
import { capitalize, formatBonusMultiplier } from '../utils/helper';
import { ALL_JOKER_ICONS } from '../components/JokerIcons';
import { OptionalTimeBonus, TOptionalTimeBonus } from '../utils/types';
import { Joker, TimeBonus } from '@yasq/shared';
import { ReadyButton } from '../components/ReadyButton';
import { TooltipDiv } from '../components/Tooltip';

export const PLAYER_TIME_BONUS_LABELS: Record<TOptionalTimeBonus, string> = {
  [TimeBonus.LINEAR]: '⏳ Steady Pace',
  [TimeBonus.EXPONENTIAL]: '🔥 Quick Fire',
  [TimeBonus.LOGISTIC]: '⚖️ Balanced',
  NONE: '❌ No time bonus',
};

export const LobbyView = ({ isHost }: { isHost: boolean }) => {
  const playersExcludingHost = participants.value.filter(p => p.id !== gameState.value.hostId);
  const readyUsers = playersExcludingHost.filter(p => gameState.value.readyUsers.includes(p.id)).length;
  const allPlayersReady = playersExcludingHost.length > 0 && readyUsers === playersExcludingHost.length;

  const [activeTooltipType, setActiveTooltipType] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTooltipType) return;

    const closeAllTooltips = () => setActiveTooltipType(null);

    window.addEventListener('touchstart', closeAllTooltips);
    window.addEventListener('click', closeAllTooltips);

    return () => {
      window.removeEventListener('touchstart', closeAllTooltips);
      window.removeEventListener('click', closeAllTooltips);
    };
  }, [activeTooltipType]);

  const handleStart = async () => {
    await backend.startGame(auth.value.access_token, discordSdk.instanceId);
  };

  const handleEditSettings = async () => {
    await backend.restartGame(auth.value.access_token, discordSdk.instanceId);
  };

  return (
    <div
      id="lobby"
      className="centered"
    >
      <div
        id="settings-summary"
        className="card-container"
      >
        <h2>Game Settings</h2>
        <hr className="divider" />

        <dl className="settings-grid">
          <dt>🔄 Rounds</dt>
          <dd id="settings-rounds">{gameState.value.gameSettings.rounds}</dd>

          <dt>⏳ Guess Time</dt>
          <dd id="settings-guess-time">{(gameState.value.gameSettings.maxGuessTime ?? 0) / 1000}s</dd>

          <dt>❓ Jokers</dt>
          <dd id="settings-jokers">
            <div className="joker-column">
              {gameState.value.gameSettings.enabledJokers.length ? (
                gameState.value.gameSettings.enabledJokers.map((jokerType: Joker) => {
                  const JokerIcon = ALL_JOKER_ICONS.find(Icon => Icon.jokerType === jokerType);

                  return (
                    <div
                      key={jokerType}
                      className="joker-row-item"
                      data-joker-type={jokerType}
                    >
                      {JokerIcon && (
                        <TooltipDiv
                          text={JokerIcon?.description || 'Description not available'}
                          className={`joker-indicator`}
                          role="img"
                        >
                          <JokerIcon />
                        </TooltipDiv>
                      )}
                      <span className="joker-text-name">{capitalize(jokerType)}</span>
                    </div>
                  );
                })
              ) : (
                <span className="no-jokers">None</span>
              )}
            </div>
          </dd>

          <dt>⏱️ Time Bonus</dt>
          <dd id="settings-time-bonus">
            {
              PLAYER_TIME_BONUS_LABELS[
                (gameState.value.gameSettings.timeBonus as TOptionalTimeBonus) ?? OptionalTimeBonus.NONE
              ]
            }
          </dd>

          <dt>🥇 First Bonus</dt>
          <dd id="settings-first-bonus">{formatBonusMultiplier(gameState.value.gameSettings.firstBonusMultiplier)}</dd>

          <dt>🔥 Streak Bonus</dt>
          <dd id="settings-streak-bonus">
            {formatBonusMultiplier(gameState.value.gameSettings.streakBonusMultiplier)}
          </dd>
        </dl>

        {isHost && (
          <button
            onClick={handleEditSettings}
            title="Edit Game Settings"
          >
            ⚙️ Edit
          </button>
        )}
      </div>

      <div className="lobby-footer">
        {isHost ? (
          <button
            id="btn-start"
            disabled={!allPlayersReady}
            onClick={handleStart}
          >
            {allPlayersReady ? 'Start Game' : `Waiting... (${readyUsers}/${playersExcludingHost.length})`}
          </button>
        ) : (
          <ReadyButton promptText={'Ready Up'} />
        )}
      </div>
    </div>
  );
};
