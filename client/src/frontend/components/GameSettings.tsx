import { useSignal } from '@preact/signals';

import { PLAYER_TIME_BONUS_LABELS } from '../../common/constants';
import { OptionalTimeBonus, TOptionalTimeBonus } from '../../common/types';
import { formatBonusMultiplier } from '../../utils/helper';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';
import { useTimeBonusSamples } from '../hooks/useTimeBonusSamples';

import { gameStatus } from '@globals';
import { AchievementBonusMode, AchievementBonusType, capitalize, Joker } from '@yasq/shared';

import { ALL_JOKER_ICONS, InfoIcon } from '@components/Icons';
import { Modal } from '@components/Modal';
import { TimeBonusPlot } from '@components/TimeBonusPlot';
import { TooltipDiv, WithTooltip } from '@components/Tooltip';

export const GameSettings = ({ onSettingsEdit }: { onSettingsEdit?: () => Promise<void> }) => {
  const jokers = gameStatus.value.settings.enabledJokers;
  const achievementBonuses = gameStatus.value.settings.achievementBonuses;

  const { getTabProps, handleKeyDown } = useRovingTabIndex(jokers.length);

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
    <>
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
              <span className="no-jokers">❌ None</span>
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
              The time bonus you earn always depends on your <span className="highlight">answer speed</span> in relation
              to the total guess time and the speed of the other players. The latter matters because the time bonus{' '}
              <span className="highlight">only starts diminishing</span> once the{' '}
              <span className="highlight">first (at least partially) correct answer</span> arrives.
            </p>
            <p>
              The following graph shows the value of the time bonus over time for some sample answer times of simulated
              players.
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
        <dd id="settings-first-bonus">
          {formatBonusMultiplier(gameStatus.value.settings.firstBonusMultiplier, '❌ None')}
        </dd>

        <dt>🔥 Streak Bonus</dt>
        <dd id="settings-streak-bonus">
          {formatBonusMultiplier(gameStatus.value.settings.streakBonusMultiplier, '❌ None')}
        </dd>

        <dt className="top">🏆 Achievements</dt>
        <dd id="settings-achievements">
          <div className="achievement-column">
            {!achievementBonuses ? (
              <span className="no-achievements">❌ None</span>
            ) : achievementBonuses.mode === AchievementBonusMode.RANDOM ? (
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

      {onSettingsEdit !== undefined && (
        <button
          onClick={onSettingsEdit}
          title="Edit Game Settings"
        >
          ⚙️ Edit
        </button>
      )}
    </>
  );
};
