import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";

import * as backend from "../utils/backend";
import { audioPlayer, auth, discordSdk, gameState, participants } from "../main";
import { getAvatarUrl, getDisplayName, Joker, POLLING_INTERVAL } from "@yasq/shared";
import { ALL_JOKER_ICONS } from '../components/JokerIcons';
import { capitalize, findUser } from "../utils/helper";
import { NonDraggableImg } from "../components/NonDraggableImg";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { Tag } from "../utils/types";

type JokerHint =
  | { type: Joker.OBFUSCATION;      data: string }
  | { type: Joker.MULTIPLE_CHOICE;  data: string[] }
  | { type: Joker.TRIVIA;           data: Tag[] }
  | { type: Joker.SPY;              data: { text: string, targetId: string } }
  | { type: Joker.GLIMPSE;          data: string };

type SubmitFunction = (guess: string) => Promise<void>;

const renderJokerHint = (activeHint: JokerHint, submit: SubmitFunction) => {
  switch (activeHint.type) {
    case Joker.OBFUSCATION:
      return (
        <p className="obfuscated-text" id="obfuscation-hint-text">
          {activeHint.data}
        </p>
      );

    case Joker.TRIVIA:
      return (
        <div className="tags-container">
          {activeHint.data.map((tag: Tag) => (
            <span key={tag.type} className="tag-badge">
              <strong>{tag.type}:</strong> {tag.value}
            </span>
          ))}
        </div>
      );

    case Joker.MULTIPLE_CHOICE:
      return (
        <div className="choices-grid">
          {activeHint.data.map((choice: string, index: number) => {
            useKeyboardShortcut({ key: (index + 1).toString(), altKey: true }, () => {
              submit(choice);
            });

            return (
              <div className="choice-button-wrapper">
                <button
                  key={choice}
                  className="choice-button"
                  onClick={async (e) => {
                    e.preventDefault();
                    await submit(choice);
                  } }
                >
                  {choice}
                </button>
                <span className="shortcut-badge">
                  <kbd>Alt</kbd> + <kbd>{index + 1}</kbd>
                </span>
              </div>
            )})
          }
        </div>
      );

    case Joker.SPY: {
      const targetUser = findUser(participants.value, activeHint.data.targetId);

      return (
        <div className="spy-hint-display">
          <div className="spy-target-info">
            <NonDraggableImg
              src={getAvatarUrl(targetUser)}
              className="avatar-small"
            />

            <span>
              <strong>{getDisplayName(targetUser)}</strong>
            </span>
          </div>

          <button
            className="choice-button"
            onClick={async (e) => {
              e.preventDefault();
              await submit(activeHint.data.text)
            }}
          >
            {activeHint.data.text}
          </button>
        </div>
      );
    }

    case Joker.GLIMPSE:
      return (
        <div className="glimpse">
          <NonDraggableImg src={activeHint.data}></NonDraggableImg>
        </div>
      );

    default:
      return null;
  }
};

export const ArenaView = ({ isHost }: { isHost: boolean }) => {
  const hasSubmitted = useSignal(false);
  const jokerError = useSignal<string | null>(null);
  const countdown = useSignal<number | null>(3);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeHint = useSignal<JokerHint | null>(null);
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
      const payload = await response.json();
      if (response.status === 200) {
        activeHint.value = {
          type: jokerType,
          data: targetId ? { text: payload.hint, targetId } : payload.hint
        };
      } else {
        jokerError.value = payload.error;
      }
      // Joker becomes unusable for the CURRENT round either way
      availableJokers.value = availableJokers.value.filter(j => j !== jokerType);
      isSelectingSpyTarget.value = false;
    } catch (err) {
      console.error("Failed to use joker:", err);
      isSelectingSpyTarget.value = false;
    }
  };

  const resetJokerHint = () => {
    activeHint.value = null;
    jokerError.value = null;
  }

  const submitGuess = async (guess: string) => {
    hasSubmitted.value = true;

    await backend.submitGuess(
      auth.value.access_token,
      discordSdk.instanceId,
      guess
    );
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
              <div className="card-container">
                <h2>Now playing</h2>
                <hr className="divider" />
                <div className="track-details">
                  <NonDraggableImg
                    src={activeTrackInfo.value.gameCover || '/game_covers/default.svg'}
                    alt={`Cover of ${activeTrackInfo.value.correctAnswer}`}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/game_covers/default.svg'; }}
                  />
                  <div>
                    <p><strong>{activeTrackInfo.value.correctAnswer}</strong></p>
                    <p><i>{activeTrackInfo.value.trackTitle}</i></p>
                    <div className="tags-container left">
                      {activeTrackInfo.value.tags.map((tag: Tag) => (
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
            <div className="centered">
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
                    const user = findUser(participants.value, targetId);

                    return (
                      <button
                        key={targetId}
                        className="spy-select-button"
                        onClick={() => handleJokerUsage(Joker.SPY, targetId)}
                      >
                        <NonDraggableImg src={getAvatarUrl(user)} className="avatar-small" />
                        <span>{getDisplayName(user)}</span>
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
              {renderJokerHint(activeHint.value, submitGuess)}
            </div>
          )}

          {jokerError.value && (
            <div className="joker-error-container">
              <span>⚠️ {jokerError.value}</span>
              <button onClick={resetJokerHint}>Ok</button>
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

                  await submitGuess(guess);
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
                  .filter(Icon => gameState.value.gameSettings.enabledJokers.includes(Icon.jokerType))
                  .map((Icon, index) => {
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

                    useKeyboardShortcut({ key: (index + 1).toString(), altKey: true }, () => {
                      handleJokerUsage(type)
                    });

                    return (
                      <div key={type} className="joker-btn-wrapper">
                        <button
                          className="joker-icon-btn"
                          id={`btn-joker-${type.toLowerCase().replace(/_/g, '-')}`}
                          title={tooltipText}
                          onClick={() => handleJokerUsage(type)}
                          disabled={!isAvailable || hasUsedJokerThisRound}
                        >
                          <Icon className="joker-svg" />
                        </button>
                        <span className="shortcut-badge">
                          <kbd>Alt</kbd>+<kbd>{index + 1}</kbd>
                        </span>
                      </div>
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