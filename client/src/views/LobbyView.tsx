import { useState, useEffect } from "preact/hooks";

import * as backend from "../utils/backend";
import { auth, discordSdk, gameState, participants } from "../main";
import { capitalize, formatBonusMultiplier, getUserId } from "../utils/helper";
import { ALL_JOKER_ICONS } from "../components/JokerIcons";
import { OptionalTimeBonus, TOptionalTimeBonus } from "../utils/types";
import { TimeBonus } from "@yasq/shared";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";


export const PLAYER_TIME_BONUS_LABELS: Record<TOptionalTimeBonus, string> = {
  [TimeBonus.LINEAR]: '⏳ Steady Pace',
  [TimeBonus.EXPONENTIAL]: '🔥 Quick Fire',
  [TimeBonus.LOGISTIC]: '⚖️ Balanced',
  NONE: '❌ No time bonus'
};

export const LobbyView = ({ isHost }: { isHost: boolean }) => {
  const playersExcludingHost = participants.value.filter(p => p.id !== gameState.value.hostId);
  const readyUsers = playersExcludingHost.filter(p => gameState.value.readyUsers.includes(p.id)).length;
  const allPlayersReady = playersExcludingHost.length > 0 && readyUsers === playersExcludingHost.length;

  const [hasInteracted, setHasInteracted] = useState(false);
  const [activeTooltipType, setActiveTooltipType] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTooltipType) return;

    const closeAllTooltips = () => setActiveTooltipType(null);

    window.addEventListener("touchstart", closeAllTooltips);
    window.addEventListener("click", closeAllTooltips);

    return () => {
      window.removeEventListener("touchstart", closeAllTooltips);
      window.removeEventListener("click", closeAllTooltips);
    };
  }, [activeTooltipType]);

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

  useKeyboardShortcut({ key: "r", altKey: true }, () => {
    if (!isHost) handleReady();
  });

  const handleEditSettings = async () => {
    await backend.restartGame(auth.value.access_token, discordSdk.instanceId);
  };

  return (
    <div id="lobby" className="centered">
      <div className="card-container">
        <h2>Game Settings</h2>
        <hr className="divider" />

        <dl className="settings-grid">
          <dt>🔄 Rounds</dt>
          <dd>{gameState.value.gameSettings.rounds}</dd>

          <dt>⏳ Track Duration</dt>
          <dd>{(gameState.value.gameSettings.trackDuration ?? 0) / 1000}s</dd>

          <dt>❓ Jokers</dt>
          <dd>
            <div className="joker-column">
              {gameState.value.gameSettings.enabledJokers.length ? (
                gameState.value.gameSettings.enabledJokers.map((jokerType) => {
                  const JokerIcon = ALL_JOKER_ICONS.find(Icon => Icon.jokerType === jokerType);
                  const isTooltipOpen = activeTooltipType === jokerType;

                  return (
                    <div key={jokerType} className="joker-row-item">
                      <div
                        className={`joker-indicator ${isTooltipOpen ? "show-tooltip" : ""}`}
                        data-tooltip={JokerIcon?.description}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          setActiveTooltipType(isTooltipOpen ? null : jokerType);
                        }}
                        onMouseLeave={() => setActiveTooltipType(null)}
                      >
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
          </dd>

          <dt>⏱️ Time Bonus</dt>
          <dd>
            {PLAYER_TIME_BONUS_LABELS[gameState.value.gameSettings.timeBonus ?? OptionalTimeBonus.NONE]}
          </dd>

          <dt>🥇 First Bonus</dt>
          <dd>
            {formatBonusMultiplier(gameState.value.gameSettings.firstBonusMultiplier)}
          </dd>

          <dt>🔥 Streak Bonus</dt>
          <dd>
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
          <button id="btn-start" disabled={!allPlayersReady} onClick={handleStart}>
            {allPlayersReady ? "Start Game" : `Waiting... (${readyUsers}/${playersExcludingHost.length})`}
          </button>
        ) : (
          <div id="lobby-guesser-ui" className='shortcut-badge-btn-wrapper'>
            <button
              className={`ready-btn ${gameState.value.readyUsers.includes(getUserId(auth.value)) ? 'ready' : ''} ${hasInteracted ? 'interacted' : ''}`}
              id="btn-ready"
              onClick={handleReady}
            >
              {gameState.value.readyUsers.includes(getUserId(auth.value)) ? "I'm Ready! ✅" : "Ready Up"}
            </button>
            <span className="shortcut-badge">
              <kbd>Alt</kbd>+<kbd>R</kbd>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
