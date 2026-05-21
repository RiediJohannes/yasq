import { useSignal } from "@preact/signals";

import * as backend from "../utils/backend";
import { participants, discordSdk, auth, gameState } from "../main";
import { getDisplayName, getAvatarUrl } from "../utils/helper";
import { ALL_JOKER_ICONS } from "./JokerIcons";
import { DEFAULT_ROUNDS, DEFAULT_TRACK_DURATION, Joker } from "@yasq/shared";

export const SetupView = ({ isHost }: { isHost: boolean }) => {
  const roundCount = useSignal(gameState.value.rounds || DEFAULT_ROUNDS);
  const trackDuration = useSignal(gameState.value.trackDuration
    ? gameState.value.trackDuration / 1000
    : DEFAULT_TRACK_DURATION);
  const isSubmitting = useSignal(false);
  const activeJokers = useSignal<Set<Joker>>(
    new Set(
      gameState.value.enabledJokers.length > 0
        ? gameState.value.enabledJokers
        : [Joker.OBFUSCATION, Joker.TRIVIA, Joker.MULTIPLE_CHOICE, Joker.SPY]
    )
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

  const handleConfirmSettings = async () => {
    isSubmitting.value = true;
    try {
      await backend.setupGame(
        auth.value.access_token,
        discordSdk.instanceId,
        roundCount.value,
        trackDuration.value,
        [...activeJokers.value]
      );
    } catch (e) {
      console.error("Setup failed:", e);
      isSubmitting.value = false;
    }
  };

  return (
    <div className="view-container centered">
      <img src="/rocket.png" className="logo" alt="Discord" />
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
              <><img src={selectedPlayer.value.avatar} className="avatar-tiny" /><span>{selectedPlayer.value.name}</span></>
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
                  <img src={getAvatarUrl(p)} className="avatar-tiny" />
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