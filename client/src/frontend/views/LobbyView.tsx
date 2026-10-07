import { useSignal } from '@preact/signals';

import { AchievementBonusType, capitalize, Joker } from '@yasq/shared';

import { gameStatus, participants, useBackend } from '@yasq/client/src/globals';
import { PLAYER_TIME_BONUS_LABELS } from '../../common/constants';
import { OptionalTimeBonus, TOptionalTimeBonus } from '../../common/types';
import { formatBonusMultiplier } from '../../utils/helper';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';
import { useTimeBonusSamples } from '../hooks/useTimeBonusSamples';

import { ALL_JOKER_ICONS, InfoIcon } from '@components/Icons';
import { Modal } from '@components/Modal';
import { ReadyButton } from '@components/ReadyButton';
import { TimeBonusPlot } from '@components/TimeBonusPlot';
import { TooltipDiv, WithTooltip } from '@components/Tooltip';
import { InviteButton } from '@components/InviteButton';

export const LobbyView = ({ isHost }: { isHost: boolean }) => {
  const backend = useBackend();
  const jokers = gameStatus.value.settings.enabledJokers;
  const achievementBonuses = gameStatus.value.settings.achievementBonuses;

  const { getTabProps, handleKeyDown } = useRovingTabIndex(jokers.length);

  const playersExcludingHost = participants.value.filter(p => p.id !== gameStatus.value.hostId);
  const readyPlayers = playersExcludingHost.filter(p => gameStatus.value.readyPlayers.includes(p.id)).length;
  const allPlayersAreReady = playersExcludingHost.length > 0 && readyPlayers === playersExcludingHost.length;

  const handleStart = async () => {
    await backend.startGame();
  };

  const handleEditSettings = async () => {
    await backend.restartGame();
  };

  const currentTimeBonusName = gameStatus.value.settings.timeBonus?.replace('_', '') ?? 'None';
  const currentTimeBonusLabel =
    PLAYER_TIME_BONUS_LABELS[(gameStatus.value.settings.timeBonus as TOptionalTimeBonus) ?? OptionalTimeBonus.NONE];

  const { timeBonusSamples, isLoading } = useTimeBonusSamples();
  const activeTimeBonusSample =
    gameStatus.value.settings.timeBonus !== null
      ? timeBonusSamples.value.get(gameStatus.value.settings.timeBonus)
      : null;

  const showTimeBonusDialog = useSignal<boolean>(false);
  const openTimeBonusDialog = () => {
    showTimeBonusDialog.value = true;
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
          <dd id="settings-rounds">{gameStatus.value.settings.rounds}</dd>

          <dt>⏳ Guess Time</dt>
          <dd id="settings-guess-time">{(gameStatus.value.settings.maxGuessTime ?? 0) / 1000}s</dd>

          <dt className="top">❓ Jokers</dt>
          <dd id="settings-jokers">
            <div className="joker-column">
              {jokers.length ? (
                jokers.map((jokerType: Joker, index: number) => {
                  const JokerIcon = ALL_JOKER_ICONS.find(Icon => Icon.jokerType === jokerType);

                  return (
                    <div
                      key={jokerType}
                      className="joker-row-item"
                      data-joker-type={jokerType}
                    >
                      {JokerIcon && (
                        <TooltipDiv
                          {...getTabProps(index)}
                          text={JokerIcon?.description || 'Description not available'}
                          className={`joker-indicator`}
                          role="img"
                          onKeyDown={e => handleKeyDown(e, index, false)}
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
            <div className="time-bonus-row">
              <span>{currentTimeBonusLabel}</span>
              {activeTimeBonusSample && (
                <WithTooltip text="Click for more info">
                  <button
                    className="time-bonus-info-btn"
                    onClick={openTimeBonusDialog}
                  >
                    <InfoIcon />
                  </button>
                </WithTooltip>
              )}
            </div>

            <Modal
              title={`Time Bonus Calculation - ${capitalize(currentTimeBonusName)} Decay`}
              width="650px"
              isOpen={showTimeBonusDialog}
            >
              <p>
                The time bonus you earn always depends on your <span className="highlight">answer speed</span> in
                relation to the total guess time and the speed of the other players. The latter matters because the time
                bonus <span className="highlight">only starts diminishing</span> once the{' '}
                <span className="highlight">first (at least partially) correct answer</span> arrives.
              </p>
              <p>
                The following graph shows the value of the time bonus over time for some sample answer times of
                simulated players.
              </p>
              <div className="time-bonus-scheme-info">
                <span>
                  <strong>Time Bonus Scheme:</strong>
                </span>
                <div className="time-bonus-label-wrapper">
                  <span className="time-bonus-label guess-text">{currentTimeBonusLabel}</span>
                  <code>({currentTimeBonusName.toLowerCase()} decay)</code>
                </div>
              </div>
              {isLoading.value ? (
                <p className="info-message time-bonus-loading">Loading sample data...</p>
              ) : (
                <TimeBonusPlot
                  currentPlayer={null}
                  participants={activeTimeBonusSample?.participants || []}
                  data={activeTimeBonusSample?.timeBonusSummary ?? null}
                />
              )}
            </Modal>
          </dd>

          <dt>🥇 First Bonus</dt>
          <dd id="settings-first-bonus">{formatBonusMultiplier(gameStatus.value.settings.firstBonusMultiplier)}</dd>

          <dt>🔥 Streak Bonus</dt>
          <dd id="settings-streak-bonus">{formatBonusMultiplier(gameStatus.value.settings.streakBonusMultiplier)}</dd>

          <dt className="top">🏆 Achievements</dt>
          <dd id="settings-achievements">
            <div className="achievement-column">
              {achievementBonuses?.mode === 'off' || !achievementBonuses ? (
                <span className="no-achievements">None</span>
              ) : achievementBonuses.mode === 'random' ? (
                <span className="achievement-text-name">Random ({achievementBonuses.randomCount})</span>
              ) : (
                <ul className="achievement-list">
                  {achievementBonuses.enabledTypes.map((achievementType: AchievementBonusType) => (
                    <li key={achievementType}>{capitalize(achievementType)}</li>
                  ))}
                </ul>
              )}
            </div>
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
          <>
            <button
              id="btn-start"
              disabled={!allPlayersAreReady}
              onClick={handleStart}
            >
              {allPlayersAreReady ? 'Start Game' : `Waiting... (${readyPlayers}/${playersExcludingHost.length})`}
            </button>
            <InviteButton />
          </>
        ) : (
          <ReadyButton promptText={'Ready Up'} />
        )}
      </div>
    </div>
  );
};
