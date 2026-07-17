import { useSignal } from "@preact/signals";
import { Fragment } from "preact/jsx-runtime";
import { TargetedEvent } from "preact";

import * as backend from "../utils/backend";
import { auth, discordSdk, gameState } from "../main";
import { ALL_JOKER_ICONS } from "../components/JokerIcons";
import {
  DEFAULT_ENABLED_JOKERS,
  DEFAULT_ROUNDS,
  DEFAULT_TRACK_DURATION,
  FirstBonusMultiplier,
  GameSettings,
  Joker,
  StreakBonusMultiplier,
  TimeBonus
} from "@yasq/shared";
import { NonDraggableImg } from "../components/NonDraggableImg";
import { OptionalTimeBonus, TOptionalTimeBonus } from "../utils/types";
import { PLAYER_TIME_BONUS_LABELS } from "./LobbyView";
import { HostTransferDropdown } from "../components/HostTransferDropdown";
import { formatBonusMultiplier } from "../utils/helper";


const HOST_TIME_BONUS_LABELS: Record<TOptionalTimeBonus, string> = {
  [TimeBonus.LINEAR]: PLAYER_TIME_BONUS_LABELS[TimeBonus.LINEAR] + ' (linear)',
  [TimeBonus.EXPONENTIAL]: PLAYER_TIME_BONUS_LABELS[TimeBonus.EXPONENTIAL] + ' (exponential)',
  [TimeBonus.LOGISTIC]: PLAYER_TIME_BONUS_LABELS[TimeBonus.LOGISTIC] + ' (logistic)',
  NONE: '❌ No time bonus'
};

export const SetupView = ({ isHost }: { isHost: boolean }) => {
  const roundCount = useSignal(gameState.value.gameSettings.rounds || DEFAULT_ROUNDS);
  const trackDuration = useSignal(gameState.value.gameSettings.trackDuration
    ? gameState.value.gameSettings.trackDuration / 1000
    : DEFAULT_TRACK_DURATION);
  const isSubmitting = useSignal(false);
  const isAdvancedOpen = useSignal(false);
  const firstBonusMultiplier = useSignal<FirstBonusMultiplier>(
    gameState.value.gameSettings.firstBonusMultiplier || FirstBonusMultiplier.OFF
  );
  const streakBonusMultiplier = useSignal<StreakBonusMultiplier>(
    gameState.value.gameSettings.streakBonusMultiplier || StreakBonusMultiplier.OFF
  );

  const activeJokers = useSignal<Set<Joker>>(
    new Set(
      gameState.value.gameSettings.enabledJokers?.length
        ? gameState.value.gameSettings.enabledJokers
        : DEFAULT_ENABLED_JOKERS
    )
  );

  const selectedBonus = useSignal<TOptionalTimeBonus>(
    gameState.value.gameSettings.timeBonus ?? OptionalTimeBonus.NONE
  );

  const toggleJoker = (type: Joker) => {
    const next = new Set(activeJokers.value);
    if (next.has(type)) {
      next.delete(type);
    } else {
      next.add(type);
    }
    activeJokers.value = next;
  };

  const selectTimeBonus = (e: TargetedEvent<HTMLSelectElement, Event>) => {
    selectedBonus.value =  (e.target as HTMLSelectElement).value as TOptionalTimeBonus;
  };

  const handleConfirmSettings = async () => {
    isSubmitting.value = true;

    const currentSettings: GameSettings = {
      rounds: roundCount.value,
      trackDuration: trackDuration.value,
      enabledJokers: [...activeJokers.value],
      firstBonusMultiplier: firstBonusMultiplier.value,
      timeBonus: selectedBonus.value === OptionalTimeBonus.NONE ? null : selectedBonus.value,
      streakBonusMultiplier: streakBonusMultiplier.value
    };

    try {
      await backend.setupGame(
        auth.value.access_token,
        discordSdk.instanceId,
        currentSettings
      );
    } catch (e) {
      console.error("Setup failed:", e);
      isSubmitting.value = false;
    }
  };

  return (
    <div className="view-container centered">
      <NonDraggableImg src="/rocket.png" className="logo" alt="Discord" />
      <h1>Welcome to YASQ!</h1>

      {!isHost ? (
        <div id="waiting-setup-msg">
          <h2>Waiting for host to setup game...</h2>
        </div>
      ) : (
        <div className="card-container" id="host-settings">
          <h2>Game Setup</h2>
          <hr className="divider" />
          <label className="setting-item">
            <span>Number of Rounds</span>
            <input type="number" id="rounds-input" min="1" max="20" value={roundCount.value}
              onInput={(e) => (roundCount.value = e.currentTarget.valueAsNumber)} />
          </label>
          <label className="setting-item">
            <span>Track Duration (sec)</span>
            <input type="number" id="duration-input" min="10" max="120" value={trackDuration.value}
              onInput={(e) => (trackDuration.value = e.currentTarget.valueAsNumber)} />
          </label>

          <div>
            <label className="setting-item"><span>Active Jokers</span></label>
            <div className="joker-config-row">
              {ALL_JOKER_ICONS.map((Icon) => {
                const isActive = activeJokers.value.has(Icon.jokerType);

                const jokerName = Icon.jokerType.toLowerCase()
                  .split('_')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');

                return (
                  <button
                    key={Icon.jokerType}
                    type="button"
                    id={`config-${Icon.jokerType.toLowerCase().replace(/_/g, '-')}`}
                    className={`joker-config-btn ${isActive ? 'active' : 'inactive'}`}
                    onClick={() => toggleJoker(Icon.jokerType)}
                    title={jokerName}
                  >
                    <Icon />
                  </button>
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
              <span className={`arrow-indicator ${isAdvancedOpen.value ? "open" : ""}`} />
            </button>

            {isAdvancedOpen.value && (
              <div className="advanced-content-panel">
                <div className="setting-item">
                  <span>Time Bonus</span>
                  <select value={selectedBonus.value} onChange={selectTimeBonus}>
                    {Object.values(OptionalTimeBonus).map((value) => (
                      <option key={value} value={value}>
                        {HOST_TIME_BONUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="setting-item">
                  <span>First Correct Answer Bonus</span>
                  <div className="button-group">
                    {Object.values(FirstBonusMultiplier)
                      .filter((val): val is number => typeof val === "number")
                      .map((value) => (
                        <Fragment key={value}>
                          <input
                            type="radio"
                            id={`first-bonus-${value}`}
                            name="first-bonus"
                            value={value}
                            checked={firstBonusMultiplier.value === value}
                            onChange={(_) => {
                              firstBonusMultiplier.value = value;
                            }}
                          />
                          <label
                            htmlFor={`first-bonus-${value}`}
                            className={`btn-radio ${firstBonusMultiplier.value === value ? "active" : ""}`}
                          >
                            {formatBonusMultiplier(value)}
                          </label>
                        </Fragment>
                      ))
                    }
                  </div>
                </div>

                <div className="setting-item">
                  <span>Streak Bonus</span>
                  <div className="button-group">
                    {Object.values(StreakBonusMultiplier)
                      .filter((val): val is number => typeof val === "number")
                      .map((value) => (
                        <Fragment key={value}>
                          <input
                            type="radio"
                            id={`streak-bonus-${value}`}
                            name="streak-bonus"
                            value={value}
                            checked={streakBonusMultiplier.value === value}
                            onChange={(_) => {
                              streakBonusMultiplier.value = value;
                            }}
                          />
                          <label
                            htmlFor={`streak-bonus-${value}`}
                            className={`btn-radio ${streakBonusMultiplier.value === value ? "active" : ""}`}
                          >
                            {formatBonusMultiplier(value)}
                          </label>
                        </Fragment>
                      ))
                    }
                  </div>
                </div>
              </div>
            )}
          </div>

          <button id="btn-start" disabled={isSubmitting.value} onClick={handleConfirmSettings}>
            {isSubmitting.value ? "Saving..." : "Confirm"}
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