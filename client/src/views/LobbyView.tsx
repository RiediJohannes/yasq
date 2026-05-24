import { useState } from "preact/hooks";

import * as backend from "../utils/backend";
import { participants, discordSdk, auth, gameState } from "../main";
import { capitalize, getUserId } from "../utils/helper";
import { ALL_JOKER_ICONS } from "./JokerIcons";

export const LobbyView = ({ isHost }: { isHost: boolean }) => {
  const playersExcludingHost = participants.value.filter(p => p.id !== gameState.value.hostId);
  const readyUsers = playersExcludingHost.filter(p => gameState.value.readyUsers.includes(p.id)).length;
  const allPlayersReady = playersExcludingHost.length > 0 && readyUsers === playersExcludingHost.length;

  const [hasInteracted, setHasInteracted] = useState(false);

  const handleStart = async () => {
    await backend.startGame(auth.value.access_token, discordSdk.instanceId);
  };

  const handleReady = async () => {
    setHasInteracted(true);

    await backend.updateReadyStatus(
      auth.value.access_token,
      discordSdk.instanceId,
      !gameState.value.readyUsers.includes(getUserId(auth.value))
    )
  };

  const handleEditSettings = async () => {
    await backend.restartGame(auth.value.access_token, discordSdk.instanceId);
  };

  return (
    <div id="lobby" className="centered">
      <div className="settings-info">
        <h2>Game Settings</h2>
        <hr className="divider" />

        <div className="settings-grid">
          <div className="settings-label">🔄 Rounds</div>
          <div className="settings-value">{gameState.value.rounds}</div>

          <div className="settings-label">⏱️ Track Duration</div>
          <div className="settings-value">{gameState.value.trackDuration / 1000}s</div>

          <div className="settings-label">❓ Jokers</div>
          <div className="settings-value">
            <div className="joker-column">
              {gameState.value.enabledJokers.length > 0 ? (
                gameState.value.enabledJokers.map((jokerType) => {
                  const JokerIcon = ALL_JOKER_ICONS.find(Icon => Icon.jokerType === jokerType);
                  return (
                    <div key={jokerType} className="joker-row-item">
                      <div className="joker-indicator" data-tooltip={JokerIcon?.description}>
                        {JokerIcon && <JokerIcon />}
                      </div>
                      <span className="joker-text-name">{capitalize(jokerType)}</span>
                    </div>
                  );
                })
              ) : (
                <span className="no-jokers">None</span>
              )}
            </div>
          </div>
        </div>

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
          <button id="btn-start" disabled={!allPlayersReady} onClick={handleStart}>
            {allPlayersReady ? "Start Game" : `Waiting... (${readyUsers}/${playersExcludingHost.length})`}
          </button>
        ) : (
          <div id="lobby-guesser-ui">
            <button
              className={`ready-btn ${gameState.value.readyUsers.includes(getUserId(auth.value)) ? 'ready' : ''} ${hasInteracted ? 'interacted' : ''}`}
              id="btn-ready"
              onClick={handleReady}
            >
              {gameState.value.readyUsers.includes(getUserId(auth.value)) ? "I'm Ready! ✅" : "Ready Up"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
