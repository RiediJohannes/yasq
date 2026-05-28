import { useSignal } from "@preact/signals";
import { Fragment } from "preact/jsx-runtime";
import { TargetedEvent } from "preact";

import * as backend from "../utils/backend";
import { auth, discordSdk, gameState, participants } from "../main";
import { getAvatarUrl, getDisplayName } from "../utils/helper";
import { ALL_JOKER_ICONS } from "../components/JokerIcons";
import {
  DEFAULT_ENABLED_JOKERS,
  DEFAULT_ROUNDS,
  DEFAULT_TRACK_DURATION,
  FirstBonusMultiplier,
  GameSettings,
  Joker,
  TimeBonus
} from "@yasq/shared";
import { NonDraggableImg } from "../components/NonDraggableImg";
import { OptionalTimeBonus, TOptionalTimeBonus } from "../utils/types";
import { PLAYER_TIME_BONUS_LABELS } from "./LobbyView";


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
      timeBonus: selectedBonus.value === OptionalTimeBonus.NONE ? null : selectedBonus.value
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
        <div className="host-settings" id="host-settings">
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
              className="advanced-toggle-btn"
              onClick={() => (isAdvancedOpen.value = !isAdvancedOpen.value)}
            >
              <span>Advanced Settings</span>
              <span className={`arrow-indicator ${isAdvancedOpen.value ? "open" : ""}`}>▶</span>
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

                <div className="setting-item vertical">
                  <span>First Correct Answer Bonus</span>
                  <div className="button-group">
                    {[
                      { value: FirstBonusMultiplier.OFF, label: "Off" },
                      { value: FirstBonusMultiplier.X1_1, label: "1.1x" },
                      { value: FirstBonusMultiplier.X1_2, label: "1.2x" },
                      { value: FirstBonusMultiplier.X1_3, label: "1.3x" },
                    ].map((option) => (
                      <Fragment key={option.value}>
                        <input
                          type="radio"
                          id={`bonus-${option.value}`}
                          name="first-bonus"
                          value={option.value}
                          checked={firstBonusMultiplier.value === option.value}
                          onChange={(_) => {
                            firstBonusMultiplier.value = option.value;
                          }}
                        />
                        <label
                          htmlFor={`bonus-${option.value}`}
                          className={`btn-radio ${firstBonusMultiplier.value === option.value ? "active" : ""}`}
                        >
                          {option.label}
                        </label>
                      </Fragment>
                    ))}
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

export const HostTransferDropdown = () => {
  const isOpen = useSignal(false);
  const selectedPlayer = useSignal<{id: string, name: string, avatar: string} | null>(null);
  const isTransferring = useSignal(false);

  const players = participants.value.filter(p => p.id !== gameState.value.hostId);

  const performTransfer = async () => {
    if (!selectedPlayer.value) return;
    isTransferring.value = true;
    try {
      await backend.assignNewHost(auth.value.access_token, discordSdk.instanceId, selectedPlayer.value.id);
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => {
      isTransferring.value = false;
      selectedPlayer.value = null;
    }, 2000);
  };

  return (
    <div className="setting-item">
      <label for="host-dropdown" className="setting-label"><span>Transfer Host</span></label>
      <div className="transfer-controls-row">
        <div className="custom-dropdown" id="host-dropdown" onClick={() => isOpen.value = !isOpen.value}>
          <div className="dropdown-header">
            {selectedPlayer.value ? (
              <><NonDraggableImg src={selectedPlayer.value.avatar} className="avatar-tiny" /><span>{selectedPlayer.value.name}</span></>
            ) : "Select a player..."}
          </div>

          {isOpen.value && (
            <div className="dropdown-list" id="dropdown-list" style={{ display: 'block' }}>
              {players.length === 0 ? (
                <div className="dropdown-item dropdown-item-empty">No other players</div>
              ) : players.map(p => (
                <div
                  data-id={p.id}
                  key={p.id}
                  className="dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectedPlayer.value = { id: p.id, name: getDisplayName(p), avatar: getAvatarUrl(p) };
                    isOpen.value = false;
                  }}
                >
                  <NonDraggableImg src={getAvatarUrl(p)} className="avatar-tiny" />
                  <span>{getDisplayName(p)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          id="btn-confirm-transfer"
          disabled={!selectedPlayer.value || isTransferring.value}
          onClick={performTransfer}
        >
          {isTransferring.value ? "Transferring..." : "Transfer"}
        </button>
      </div>
    </div>
  );
};