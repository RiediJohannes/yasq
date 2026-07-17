import { useSignal } from "@preact/signals";

import { DEFAULT_VOLUME_SLIDER_VAL, getAvatarUrl, getDisplayName, MAX_VOLUME } from "@yasq/shared";
import { gainNode, gameState, isMac, participants, volume } from "../main";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { getActionKeyLabel } from "../utils/helper";
import { DiscordAvatar } from "./DiscordAvatar";


export const Sidebar = () => {
  const mutedVolume = useSignal<number | null>(null);

  const toggleMute = () => {
    if (gainNode.gain.value > 0) {
      mutedVolume.value = volume.value;
      volume.value = 0;
      gainNode.gain.value = 0;
    } else {
      const restoreTo = mutedVolume.value ?? DEFAULT_VOLUME_SLIDER_VAL;
      volume.value = restoreTo;
      gainNode.gain.value = restoreTo * MAX_VOLUME;
      mutedVolume.value = null;
    }
  };

  const updateVolume = (newVal: number) => {
    const clamped = Math.max(0, Math.min(1, newVal));
    volume.value = clamped;
    gainNode.gain.value = clamped * MAX_VOLUME;
  };

  const sortedParticipants = [...participants.value].sort((a, b) => {
    const isAHost = a.id === gameState.value.hostId;
    const isBHost = b.id === gameState.value.hostId;

    if (isAHost) return -1;
    if (isBHost) return 1;
    return 0;
  });

  const step = 0.01;
  useKeyboardShortcut({ key: "ArrowUp", altKey: !isMac, metaKey: isMac }, () => updateVolume(volume.value + step));
  useKeyboardShortcut({ key: "ArrowDown", altKey: !isMac, metaKey: isMac }, () => updateVolume(volume.value - step));
  useKeyboardShortcut({ key: "M", altKey: !isMac, metaKey: isMac }, () => toggleMute());

  return (
    <div className="sidebar">
      <div className="sidebar-box participants">
        <h3>Participating Players</h3>
        <div id="participant-list">
          {sortedParticipants.map((p) => {
            const isPlayerHost = p.id === gameState.value.hostId;
            const isPlayerReady = gameState.value.readyUsers.includes(p.id);
            const hasPlayerGuessed = gameState.value.guessedPlayers.includes(p.id);
            const isLastWinner = p.id === gameState.value.lastWinnerId;

            const brokenStreak = gameState.value.lostStreaks?.[p.id] || 0;
            const activeStreak = gameState.value.streaks?.[p.id] || 0;
            const streakToDisplay = brokenStreak > 0 ? brokenStreak : activeStreak;
            const isStreakBroken = brokenStreak > 0;

            return (
              <div key={p.id} className="player-entry">
                <DiscordAvatar
                  src={getAvatarUrl(p)}
                  userName={getDisplayName(p)}
                  tiny={true}
                />
                <div className="player-info-container">
                  <span className="player-name">{getDisplayName(p)}</span>
                  <div className="badge-container">
                    {isPlayerHost && <span className="badge host">HOST</span>}
                    {isLastWinner && <span className="badge winner">👑</span>}
                    {streakToDisplay > 0 && (
                      <span
                        className={`badge streak streak-tier-${Math.min(Math.ceil(streakToDisplay / 2), 4)} ${isStreakBroken ? "broken" : ""}`}
                        data-streak={streakToDisplay}
                      >
                        🔥 {streakToDisplay}
                      </span>
                    )}
                    {isPlayerReady && <span className="badge ready">READY</span>}
                    {hasPlayerGuessed && <span className="badge guessed">GUESSED</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="sidebar-box">
        <div className="volume-controls">
          <label htmlFor="volume-slider">Volume</label>
          <div className="volume-controls-row">
            <div className="volume-stack">
              <input type="range" id="volume-slider" min="0" max="1" step="0.01" value={volume.value} onInput={(e) => {
                const target = e.currentTarget as HTMLInputElement;
                const val = parseFloat(target.value);
                volume.value = val;
                gainNode.gain.value = val * MAX_VOLUME;
              }} />
              <span className="shortcut-badge">
                <kbd>{getActionKeyLabel(isMac)}</kbd> + <kbd>▲</kbd> / <kbd>▼</kbd>
              </span>
            </div>
            <div className="volume-stack">
              <button className="mute-button" onClick={toggleMute}>
                {volume.value === 0 ? "🔇" : "🔊"}
              </button>
              <span className="shortcut-badge">
                <kbd>{getActionKeyLabel(isMac)}</kbd> + <kbd>M</kbd>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
};