import { useSignal } from '@preact/signals';
import { TargetedEvent } from 'preact';

import * as backend from '../utils/backend';
import { discordSdk, gameState, useAuth } from '../main';
import { ALL_JOKER_ICONS } from '../components/Icons';
import {
  AchievementBonuses,
  AchievementBonusType,
  DEFAULT_ENABLED_JOKERS,
  DEFAULT_MAX_GUESS_TIME,
  DEFAULT_ROUNDS,
  FirstBonusMultiplier,
  GameSettings,
  Joker,
  sortByEnumOrder,
  StreakBonusMultiplier,
  TimeBonus,
} from '@yasq/shared';
import { NonDraggableImg } from '../components/NonDraggableImg';
import { OptionalTimeBonus, TOptionalTimeBonus } from '../utils/types';
import { PLAYER_TIME_BONUS_LABELS } from './LobbyView';
import { HostTransferDropdown } from '../components/HostTransferDropdown';
import { formatBonusMultiplier } from '../utils/helper';
import { TimeBonusPlot } from '../components/TimeBonusPlot';
import { useTimeBonusSamples } from '../hooks/useTimeBonusSamples';
import { WithTooltip } from '../components/Tooltip';
import { RadioGroup } from '../components/RadioGroup';
import { AchievementBonusSettingsPanel } from '../components/AchievementBonusSettings';

const HOST_TIME_BONUS_LABELS: Record<TOptionalTimeBonus, string> = {
  [TimeBonus.LINEAR]: PLAYER_TIME_BONUS_LABELS[TimeBonus.LINEAR] + ' (linear)',
  [TimeBonus.EXPONENTIAL]: PLAYER_TIME_BONUS_LABELS[TimeBonus.EXPONENTIAL] + ' (exponential)',
  [TimeBonus.LOGISTIC]: PLAYER_TIME_BONUS_LABELS[TimeBonus.LOGISTIC] + ' (logistic)',
  NONE: '❌ No time bonus',
};

export const SetupView = ({ isHost }: { isHost: boolean }) => {
  const auth = useAuth();
  const roundCount = useSignal(gameState.value.gameSettings.rounds || DEFAULT_ROUNDS);
  const maxGuessTime = useSignal(
    gameState.value.gameSettings.maxGuessTime
      ? gameState.value.gameSettings.maxGuessTime / 1000
      : DEFAULT_MAX_GUESS_TIME
  );
  const isSubmitting = useSignal(false);
  const isAdvancedOpen = useSignal(false);
  const firstBonusMultiplier = useSignal<FirstBonusMultiplier>(
    gameState.value.gameSettings.firstBonusMultiplier || FirstBonusMultiplier.OFF
  );
  const streakBonusMultiplier = useSignal<StreakBonusMultiplier>(
    gameState.value.gameSettings.streakBonusMultiplier || StreakBonusMultiplier.OFF
  );

  const achievementBonuses = useSignal<AchievementBonuses>(
    gameState.value.gameSettings.achievementBonuses || {
      mode: 'manual',
      enabledTypes: Object.values(AchievementBonusType),
      randomCount: 1,
    }
  );

  const activeJokers = useSignal<Set<Joker>>(
    new Set(gameState.value.gameSettings.enabledJokers ?? DEFAULT_ENABLED_JOKERS)
  );

  const selectedBonus = useSignal<TOptionalTimeBonus>(gameState.value.gameSettings.timeBonus ?? OptionalTimeBonus.NONE);

  const { timeBonusSamples, isLoading } = useTimeBonusSamples();

  const activeTimeBonusSample =
    selectedBonus.value !== OptionalTimeBonus.NONE
      ? timeBonusSamples.value.get(selectedBonus.value as TimeBonus)
      : null;

  const sampleParticipants = new Map((activeTimeBonusSample?.participants || []).map(p => [p.id, p]));

  const toggleJoker = (type: Joker) => {
    const updatedJokerSet = new Set(activeJokers.value);
    if (updatedJokerSet.has(type)) {
      updatedJokerSet.delete(type);
    } else {
      updatedJokerSet.add(type);
    }
    activeJokers.value = updatedJokerSet;
  };

  const selectTimeBonus = (e: TargetedEvent<HTMLSelectElement, Event>) => {
    selectedBonus.value = (e.target as HTMLSelectElement).value as TOptionalTimeBonus;
  };

  const handleConfirmSettings = async () => {
    isSubmitting.value = true;

    const currentSettings: GameSettings<Joker[]> = {
      rounds: roundCount.value,
      maxGuessTime: maxGuessTime.value,
      enabledJokers: [...activeJokers.value].sort(sortByEnumOrder(Joker)),
      firstBonusMultiplier: firstBonusMultiplier.value,
      timeBonus: selectedBonus.value === OptionalTimeBonus.NONE ? null : selectedBonus.value,
      streakBonusMultiplier: streakBonusMultiplier.value,
      achievementBonuses: {
        mode: achievementBonuses.value.mode,
        enabledTypes: achievementBonuses.value.mode === 'manual' ? achievementBonuses.value.enabledTypes : [],
        randomCount: achievementBonuses.value.mode === 'random' ? achievementBonuses.value.randomCount : 0,
      },
    };

    try {
      await backend.setupGame(auth.access_token, discordSdk.instanceId, currentSettings);
    } catch (e) {
      console.error('Setup failed:', e);
    }

    isSubmitting.value = false;
  };

  return (
    <div className="view-container centered">
      <NonDraggableImg
        src="/rocket.png"
        className="logo"
        alt="Discord"
      />
      <h1>Welcome to YASQ!</h1>

      {!isHost ? (
        <div id="waiting-setup-msg">
          <h2>Waiting for host to setup game...</h2>
        </div>
      ) : (
        <div
          className="card-container"
          id="host-settings"
        >
          <h2>Game Setup</h2>
          <hr className="divider" />
          <label className="setting-item">
            <span>Number of Rounds</span>
            <input
              type="number"
              id="rounds-input"
              min="1"
              max="20"
              value={roundCount.value}
              onInput={e => (roundCount.value = e.currentTarget.valueAsNumber)}
            />
          </label>
          <label className="setting-item">
            <span>Guess Time (sec)</span>
            <input
              type="number"
              id="guess-time-input"
              min="10"
              max="120"
              value={maxGuessTime.value}
              onInput={e => (maxGuessTime.value = e.currentTarget.valueAsNumber)}
            />
          </label>

          <div>
            <label className="setting-item">
              <span>Active Jokers</span>
            </label>
            <div className="joker-config-row">
              {ALL_JOKER_ICONS.map(Icon => {
                const isActive = activeJokers.value.has(Icon.jokerType);

                const jokerName = Icon.jokerType
                  .toLowerCase()
                  .split('_')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');

                return (
                  <WithTooltip text={jokerName}>
                    <button
                      key={Icon.jokerType}
                      type="button"
                      id={`config-${Icon.jokerType.toLowerCase().replace(/_/g, '-')}`}
                      className={`joker-config-btn ${isActive ? 'active' : 'inactive'}`}
                      onClick={() => toggleJoker(Icon.jokerType)}
                    >
                      <Icon />
                    </button>
                  </WithTooltip>
                );
              })}
            </div>
          </div>

          <div className="advanced-settings-section">
            <button
              type="button"
              id="advanced-settings-btn"
              className="toggle-btn advanced-settings-btn"
              onClick={() => (isAdvancedOpen.value = !isAdvancedOpen.value)}
            >
              <span>Advanced Settings</span>
              <span className={`arrow-indicator ${isAdvancedOpen.value ? 'open' : ''}`} />
            </button>

            {isAdvancedOpen.value && (
              <div
                id="advanced-settings"
                className="advanced-content-panel"
              >
                <div className="setting-item">
                  <span>Time Bonus</span>
                  <select
                    id="time-bonus-select"
                    value={selectedBonus.value}
                    onChange={selectTimeBonus}
                  >
                    {Object.values(OptionalTimeBonus).map(value => (
                      <option
                        key={value}
                        value={value}
                      >
                        {HOST_TIME_BONUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  {isLoading.value ? (
                    <p className="info-message time-bonus-loading">Loading sample data...</p>
                  ) : (
                    <TimeBonusPlot
                      currentPlayer={null}
                      participants={sampleParticipants}
                      data={activeTimeBonusSample?.timeBonusSummary ?? null}
                    />
                  )}
                </div>

                <div className="setting-item">
                  <span>First Correct Answer Bonus</span>
                  <RadioGroup
                    groupId="first-bonus-group"
                    name="first-bonus"
                    value={firstBonusMultiplier.value}
                    onChange={val => {
                      firstBonusMultiplier.value = val;
                    }}
                    options={Object.values(FirstBonusMultiplier)
                      .filter((val): val is number => typeof val === 'number')
                      .map(val => ({
                        label: formatBonusMultiplier(val),
                        value: val,
                      }))}
                  />
                </div>

                <div className="setting-item">
                  <span>Streak Bonus</span>
                  <RadioGroup
                    groupId="streak-bonus-group"
                    name="streak-bonus"
                    value={streakBonusMultiplier.value}
                    onChange={val => {
                      streakBonusMultiplier.value = val;
                    }}
                    options={Object.values(StreakBonusMultiplier)
                      .filter((val): val is number => typeof val === 'number')
                      .map(val => ({
                        label: formatBonusMultiplier(val),
                        value: val,
                      }))}
                  />
                </div>

                <div className="setting-item">
                  <span>Achievement Bonus</span>
                  <AchievementBonusSettingsPanel settingsSignal={achievementBonuses} />
                </div>
              </div>
            )}
          </div>

          <button
            id="btn-start"
            disabled={isSubmitting.value}
            onClick={handleConfirmSettings}
          >
            {isSubmitting.value ? 'Saving...' : 'Confirm'}
          </button>

          <hr className="divider" />
          <div className="setting-group">
            <HostTransferDropdown />
          </div>
        </div>
      )}
    </div>
  );
};
