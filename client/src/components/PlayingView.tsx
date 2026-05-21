import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

import * as backend from "../utils/backend";
import { gameState, auth, discordSdk, audioPlayer, participants } from "../main";
import { Joker, POLLING_INTERVAL } from "@yasq/shared";
import { ALL_JOKER_ICONS } from './JokerIcons';
import { capitalize, getAvatarUrl, getDisplayName } from "../utils/helper";

export const ArenaView = ({ isHost }: { isHost: boolean }) => {
  const hasSubmitted = useSignal(false);
  const countdown = useSignal<number | null>(3);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeHint = useSignal<{ type: Joker, data: any } | null>(null);
  const availableJokers = useSignal<string[]>([]);
  const isSelectingSpyTarget = useSignal(false);
  const activeTrackInfo = useSignal<any>(null);

  useEffect(() => {
    if (isHost) return;
    backend.getAvailableJokers(auth.value.access_token, discordSdk.instanceId).then((data) => {
      availableJokers.value = data.available;
    })
  }, [gameState.value.currentRound]);

  const handleJokerUsage = async (jokerType: Joker, targetId?: string) => {
    if (jokerType === Joker.SPY && !targetId) {
      isSelectingSpyTarget.value = true;
      return;
    }

    try {
      const response = await backend.useJoker(auth.value.access_token, discordSdk.instanceId, jokerType, targetId);
      activeHint.value = {
        type: jokerType,
        data: targetId ? { text: response.hint, targetId } : response.hint
      };
      availableJokers.value = availableJokers.value.filter(j => j !== jokerType);
      isSelectingSpyTarget.value = false;
    } catch (err) {
      console.error("Failed to use joker:", err);
      isSelectingSpyTarget.value = false;
    }
  };

  useEffect(() => {
    const roundStarted = countdown.value === null;
    const canFocus = !isHost && !hasSubmitted.value && inputRef.current;

    if (roundStarted && canFocus) {
      inputRef.current?.focus();
    }
  }, [countdown.value]);

  useEffect(() => {
    const sync = async () => {
      try {
        const { url, startTime, endTime, ...hostData } = await backend.getCurrentTrack( auth.value.access_token, discordSdk.instanceId);
        if (!url) return;

        if (isHost) {
          activeTrackInfo.value = hostData;
        }

        const now = Date.now();
        const totalDurationMs = endTime - startTime;
        const timePassedMs = now - startTime;

        const progressBar = document.getElementById('progress-bar');

        // 1. Countdown Phase (before startTime)
        if (timePassedMs < 0) {
          const remainingSeconds = Math.abs(Math.ceil(timePassedMs / 1000));
          countdown.value = remainingSeconds > 0 ? remainingSeconds : null;

          // Ensure player is paused and ready at the start
          audioPlayer.pause();
          audioPlayer.currentTime = 0;
          if (audioPlayer.src !== window.location.origin + url) audioPlayer.src = url;

          if (progressBar) {
            progressBar.style.width = '100%';
          }
          return; // Don't play the track until the countdown finishes
        }

        // 2. Playing Phase
        countdown.value = null;
        let percentage = 100 - (timePassedMs / totalDurationMs * 100);
        percentage = Math.max(0, Math.min(100, percentage));

        if (progressBar) {
          progressBar.style.width = `${percentage}%`;
          progressBar.style.backgroundColor = percentage < 20 ? '#f04747' : '#5865f2';
        }

        // Check if we need to load a new source
        if (audioPlayer.src !== window.location.origin + url) {
          audioPlayer.src = url;
        }

        // Sync timing
        const elapsedSeconds = timePassedMs / 1000;

        // If we are more than 2 seconds out of sync, snap to server time
        if (Math.abs(audioPlayer.currentTime - elapsedSeconds) > 2) {
          audioPlayer.currentTime = elapsedSeconds;
        }

        if (audioPlayer.paused) {
          audioPlayer.play().catch(() => {});
        }

      } catch (err) {
        console.error("Arena sync error:", err);
      }
    };

    const interval = setInterval(sync, POLLING_INTERVAL);
    return () => {
      clearInterval(interval);
    };
  }, [isHost]);

  return (
    <div id="game-arena" className="centered">
      {countdown.value !== null && (
        <div id="countdown-overlay">
          <div id="countdown-number">{countdown.value}</div>
        </div>
      )}

      {isHost ? (
        <div id="game-host-ui">
          {activeTrackInfo.value ? (
            <div>
              <div className="round-result-summary">
                <h2>Now playing</h2>
                <hr className="divider" />
                <div className="track-details">
                  <img
                    src={activeTrackInfo.value.gameCover || '/game_covers/default.svg'}
                    alt={`Cover of ${activeTrackInfo.value.correctAnswer}`}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/game_covers/default.svg'; }}
                  />
                  <div>
                    <p><strong>{activeTrackInfo.value.correctAnswer}</strong></p>
                    <p><i>{activeTrackInfo.value.trackTitle}</i></p>
                    <div className="tags-container left">
                      {activeTrackInfo.value.tags.map((tag: any) => (
                        <span key={tag.type} title={capitalize(tag.type)} className="tag-badge">
                          {tag.value}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <h2>Waiting for players to submit their guesses...</h2>
            </div>
          ) : (
            <div class="centered">
              <div className="loading-spinner"></div>
            </div>
          )}
        </div>
      ) : (
        <div id="game-guesser-ui">
          {isSelectingSpyTarget.value && (
            <div className="hint-container">
              <h2>Pick a player to spy on:</h2>
              <hr className="divider" />
              <div className="spy-hint-player-list">
                {gameState.value.guessedPlayers.filter(id => id !== auth.value.userId).length === 0 ? (
                  <p className="no-results">No player has submitted a guess yet.</p>
                ) : (
                  gameState.value.guessedPlayers.map(targetId => {
                    const discordUser = participants.value.find(p => p.id === targetId) ||
                                        { id: "0", username: 'Unknown' };

                    return (
                      <button
                        key={targetId}
                        className="spy-select-button"
                        onClick={() => handleJokerUsage(Joker.SPY, targetId)}
                      >
                        <img src={getAvatarUrl(discordUser)} className="avatar-small" />
                        <span>{getDisplayName(discordUser)}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <button onClick={() => isSelectingSpyTarget.value = false}>Cancel</button>
            </div>
          )}

          {activeHint.value && !hasSubmitted.value && (
            <div className="hint-container">
              {activeHint.value.type === Joker.OBFUSCATION && (
                <p className="obfuscated-text" id="obfuscation-hint-text">{activeHint.value.data}</p>
              )}

              {activeHint.value.type === Joker.TRIVIA && (
                <div className="tags-container">
                  {activeHint.value.data.map((tag: any) => (
                    <span key={tag.type} className="tag-badge">
                      <strong>{tag.type}:</strong> {tag.value}
                    </span>
                  ))}
                </div>
              )}

              {activeHint.value.type === Joker.MULTIPLE_CHOICE && (
                <div className="choices-grid">
                  {activeHint.value.data.map((choice: string) => (
                    <button
                      key={choice}
                      className="choice-button"
                      onClick={async (e) => {
                        e.preventDefault();
                        hasSubmitted.value = true;
                        await backend.submitGuess(auth.value.access_token, discordSdk.instanceId, choice);
                      }}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              {activeHint.value?.type === Joker.SPY && (
                <div className="spy-hint-display">
                  {(() => {
                    const targetUser = participants.value.find(p => p.id === activeHint.value?.data.targetId) ||
                                      { id: "0", username: 'Unknown' };
                    return (
                      <div className="spy-target-info">
                        <img src={getAvatarUrl(targetUser)} className="avatar-small" />
                        <span><strong>{getDisplayName(targetUser)}</strong></span>
                      </div>
                    );
                  })()}

                  <button
                    className="choice-button"
                    onClick={async (e) => {
                      e.preventDefault();
                      hasSubmitted.value = true;
                      await backend.submitGuess(auth.value.access_token, discordSdk.instanceId, activeHint.value?.data.text);
                    }}
                  >
                    {activeHint.value?.data.text}
                  </button>
                </div>
              )}
            </div>
          )}

          {!hasSubmitted.value ? (
            <div>
              <form
                id="game-guesser-form"
                className="game-guesser-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const input = form.elements.namedItem('guess-input') as HTMLInputElement;
                  const guess = input.value.trim();
                  if (!guess) return;

                  hasSubmitted.value = true;
                  await backend.submitGuess(auth.value.access_token, discordSdk.instanceId, guess);
                }}
              >
                <input
                  type="text"
                  ref={inputRef}
                  id="guess-input"
                  name="guess-input"
                  placeholder="Enter game title..."
                  autoFocus
                  autoComplete="off"
                />
                <button type="submit" id="btn-submit">Submit Guess</button>
              </form>

              <div className="joker-list">
                {ALL_JOKER_ICONS
                  // Only show jokers that were enabled by the host during setup
                  .filter(Icon => gameState.value.enabledJokers.includes(Icon.jokerType))
                  .map((Icon) => {
                    const type = Icon.jokerType;
                    const isAvailable = availableJokers.value.includes(type);
                    const hasUsedJokerThisRound = activeHint.value !== null;

                    // Format name: MULTIPLE_CHOICE -> Multiple Choice
                    const jokerName = Icon.jokerType.toLowerCase()
                      .split('_')
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ');

                    // Construct the tooltip text
                    const tooltipText = isAvailable ? jokerName : `${jokerName} (Already Used)`;

                    return (
                      <button
                        key={type}
                        className="joker-icon-btn"
                        id={`btn-joker-${type.toLowerCase().replace(/_/g, '-')}`}
                        title={tooltipText}
                        onClick={() => handleJokerUsage(type)}
                        disabled={!isAvailable || hasUsedJokerThisRound}
                      >
                        <Icon className="joker-svg" />
                      </button>
                    );
                })}
              </div>
            </div>
          ) : (
            <div className="waiting-container">
              <p className="waiting-msg" id="waiting-msg">Guess submitted! Waiting for others...</p>
            </div>
          )}
        </div>
      )}

      <div id="progress-container">
        <div id="progress-bar"></div>
      </div>
    </div>
  );
};