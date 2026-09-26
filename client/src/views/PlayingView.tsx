import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';

import { audioPlayer, discordSdk, gameState, isMac, participants, useAuth } from '../main';
import * as backend from '../utils/backend';
import * as connections from '../utils/connections';
import {
  COUNTDOWN_DURATION,
  GameEvent,
  getAvatarUrl,
  getDisplayName,
  Joker,
  LogLevel,
  MAX_GUESS_LENGTH,
  RoundTimingData,
  Tag,
} from '@yasq/shared';
import { ALL_JOKER_ICONS } from '../components/Icons';
import { capitalize, findUser, getActionKeyLabel, getUserId } from '../utils/helper';
import { NonDraggableImg } from '../components/NonDraggableImg';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { DiscordAvatar } from '../components/DiscordAvatar';
import { TooltipDiv, WithTooltip } from '../components/Tooltip';
import { LoadingSpinner } from '../components/LoadingSpinner';

type JokerHint =
  | { type: Joker.OBFUSCATION; data: string }
  | { type: Joker.MULTIPLE_CHOICE; data: string[] }
  | { type: Joker.TRIVIA; data: Tag[] }
  | { type: Joker.SPY; data: { text: string; targetId: string } }
  | { type: Joker.GLIMPSE; data: string };

type SubmitFunction = (guess: string) => Promise<void>;

const renderJokerHint = (activeHint: JokerHint, submit: SubmitFunction) => {
  switch (activeHint.type) {
    case Joker.OBFUSCATION:
      return (
        <p
          className="obfuscated-text"
          id="obfuscation-hint-text"
        >
          {activeHint.data}
        </p>
      );

    case Joker.TRIVIA:
      return (
        <div className="tags-container">
          {activeHint.data.map((tag: Tag) => (
            <span
              key={tag.type}
              className="tag-badge"
            >
              <strong>{tag.type}:</strong> {tag.value}
            </span>
          ))}
        </div>
      );

    case Joker.MULTIPLE_CHOICE:
      return (
        <div className="choices-grid">
          {activeHint.data.map((choice: string, index: number) => {
            useKeyboardShortcut({ key: (index + 1).toString(), altKey: !isMac, metaKey: isMac }, () => {
              void submit(choice);
            });

            return (
              <div className="choice-button-wrapper">
                <button
                  key={choice}
                  className="choice-button"
                  onClick={async e => {
                    e.preventDefault();
                    await submit(choice);
                  }}
                >
                  {choice}
                </button>
                <span className="shortcut-badge">
                  <kbd>{getActionKeyLabel(isMac)}</kbd> + <kbd>{index + 1}</kbd>
                </span>
              </div>
            );
          })}
        </div>
      );

    case Joker.SPY: {
      const targetUser = findUser(participants.value, activeHint.data.targetId);

      return (
        <div className="spy-hint-display">
          <div className="spy-target-info">
            <DiscordAvatar
              src={getAvatarUrl(targetUser)}
              userName={getDisplayName(targetUser)}
            />
            <span>
              <strong>{getDisplayName(targetUser)}</strong>
            </span>
          </div>

          <button
            className="choice-button"
            onClick={async e => {
              e.preventDefault();
              await submit(activeHint.data.text);
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

enum PlayingViewPhase {
  SETUP = 0,
  COUNTDOWN = 1,
  PLAYING = 2,
}

export const PlayingView = ({ isHost }: { isHost: boolean }) => {
  const auth = useAuth();
  const hasSubmitted = useSignal(false);
  const jokerError = useSignal<string | null>(null);

  // Phases: SETUP ("Ready?") -> COUNTDOWN (3, 2, 1) -> PLAYING
  const currentPhase = useSignal<PlayingViewPhase>(PlayingViewPhase.SETUP);
  const countdownValue = useSignal<number>(3);

  const inputRef = useRef<HTMLInputElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const activeHint = useSignal<JokerHint | null>(null);
  const availableJokers = useSignal<string[]>([]);
  const isSelectingSpyTarget = useSignal(false);
  const activeTrackInfo = useSignal<any>(null);

  useEffect(() => {
    if (isHost) return;
    backend.getAvailableJokers(auth.access_token, discordSdk.instanceId).then(data => {
      availableJokers.value = data.available;
    });
  }, [gameState.value.currentRound, isHost]);

  const handleJokerUsage = async (jokerType: Joker, targetId?: string) => {
    if (jokerType === Joker.SPY && !targetId) {
      isSelectingSpyTarget.value = true;
      return;
    }

    try {
      const response = await backend.useJoker(auth.access_token, discordSdk.instanceId, jokerType, targetId);
      const payload = await response.json();
      if (response.status === 200) {
        activeHint.value = {
          type: jokerType,
          data: targetId ? { text: payload.hint, targetId } : payload.hint,
        };
      } else {
        jokerError.value = payload.error;
      }
      availableJokers.value = availableJokers.value.filter(j => j !== jokerType);
      isSelectingSpyTarget.value = false;
    } catch (err) {
      console.error('Failed to use joker:', err);
      isSelectingSpyTarget.value = false;
    }
  };

  const resetJokerHint = () => {
    activeHint.value = null;
    jokerError.value = null;
  };

  const submitGuess = async (guess: string) => {
    hasSubmitted.value = true;
    await backend.submitGuess(auth.access_token, discordSdk.instanceId, guess);
  };

  // Autofocus input when playing phase starts
  useEffect(() => {
    if (currentPhase.value === PlayingViewPhase.PLAYING && !isHost && !hasSubmitted.value && inputRef.current) {
      inputRef.current?.focus();
    }
  }, [currentPhase.value]);

  const bufferAudio = (url: string, abortSignal: AbortSignal): Promise<void> => {
    // Preload audio buffer
    audioPlayer.src = url;
    audioPlayer.load();

    return new Promise<void>((resolve, reject) => {
      // Check if the audion player has already finished buffering
      if (audioPlayer.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        resolve();
        return;
      }

      // Otherwise, get notified when it does
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;

        clearTimeout(fallback);
        audioPlayer.removeEventListener('canplaythrough', handleCanPlay);
        abortSignal.removeEventListener('abort', handleAbort);
        resolve();
      };

      const handleAbort = () => {
        if (settled) return;
        settled = true;

        clearTimeout(fallback);
        audioPlayer.removeEventListener('canplaythrough', handleCanPlay);
        reject(new DOMException('Aborted', 'AbortError'));
      };

      const handleCanPlay = () => done();
      const fallback = setTimeout(done, 5000);

      audioPlayer.addEventListener('canplaythrough', handleCanPlay);
      abortSignal.addEventListener('abort', handleAbort, { once: true });
    });
  };

  // Animate countdown
  const startAnimationLoop = (
    roundTimingData: { startTime: number; endTime: number },
    abortSignal: AbortSignal
  ): number => {
    let animationFrameId: number;
    const { startTime, endTime } = roundTimingData;
    const totalDurationMillis = endTime - startTime;

    const animateCountdownAndProgressBar = () => {
      if (abortSignal.aborted) return;

      const now = connections.getSyncedServerTime();
      const timeDifference = now - startTime;
      const progressBar = progressBarRef.current;

      if (timeDifference < 0) {
        // Render waiting message and countdown
        audioPlayer.pause();
        audioPlayer.currentTime = 0;

        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.classList.remove('danger', 'blink');
        }

        // Check if it is time to show the countdown already
        const remainingMilliseconds = Math.abs(timeDifference);

        if (remainingMilliseconds <= COUNTDOWN_DURATION) {
          // Only now start the numbered countdown
          currentPhase.value = PlayingViewPhase.COUNTDOWN;

          const remainingSeconds = Math.ceil(remainingMilliseconds / 1000);
          countdownValue.value = Math.max(1, Math.min(COUNTDOWN_DURATION / 1000, remainingSeconds));
        } else {
          currentPhase.value = PlayingViewPhase.SETUP;
        }
      } else {
        // Play track and animate progress bar
        currentPhase.value = PlayingViewPhase.PLAYING;

        let progressPercentage = 100 - (timeDifference / totalDurationMillis) * 100;
        progressPercentage = Math.max(0, Math.min(100, progressPercentage));

        if (progressBar) {
          progressBar.style.width = `${progressPercentage}%`;
          progressBar.classList.toggle('danger', progressPercentage < 20);
          progressBar.classList.toggle('blink', progressPercentage < 5);
        }

        const elapsedSeconds = timeDifference / 1000;
        const trackDuration = audioPlayer.duration || totalDurationMillis / 1000;
        const expectedPlaybackTime = trackDuration > 0 ? elapsedSeconds % trackDuration : elapsedSeconds;

        // Correct the audio player if we are off by at least one second
        if (Math.abs(audioPlayer.currentTime - expectedPlaybackTime) >= 1) {
          audioPlayer.currentTime = expectedPlaybackTime;
        }

        if (audioPlayer.paused) {
          audioPlayer.play().catch(async () =>
            backend.logToServer(LogLevel.ERROR, 'Failed to play track', getUserId(auth), {
              instanceId: discordSdk.instanceId,
            })
          );
        }
      }

      // Register self to be called again on the next animation frame
      animationFrameId = requestAnimationFrame(animateCountdownAndProgressBar);
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(animateCountdownAndProgressBar);
    return animationFrameId;
  };

  // Initialize round (pre-buffer audio track and start countdown/progressBar animation loop)
  useEffect(() => {
    let animationFrameId: number;
    let cleanupHandlers: (() => void) | undefined;
    const controller = new AbortController();
    const { signal: abortSignal } = controller;

    // Ensure audio player is immediately halted when entering/switching rounds
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer.src = '';

    // Wrap async calls in a function because useEffect handler must remain synchronous
    const setupRound = async () => {
      currentPhase.value = PlayingViewPhase.SETUP;
      const setupStartTime = Date.now();

      try {
        const trackData = await backend.getCurrentTrack(auth.access_token, discordSdk.instanceId);
        if (!trackData || !trackData.url || abortSignal.aborted) return;

        if (isHost) {
          activeTrackInfo.value = trackData;
        }

        await bufferAudio(window.location.origin + trackData.url, abortSignal);

        const handleRoundStarting = (roundTimingData: RoundTimingData) => {
          if (abortSignal.aborted) return;
          animationFrameId = startAnimationLoop(roundTimingData, abortSignal);
        };

        // Listen for the server's round start event
        cleanupHandlers = connections.onNextGameEvent<RoundTimingData>(GameEvent.ROUND_STARTING, handleRoundStarting);

        // Notify the server that we are ready to start the round now
        connections.emitGameEvent(GameEvent.READY_TO_PLAY, { setupDuration: Date.now() - setupStartTime });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;

        console.error('Round setup error:', err);
      }
    };

    void setupRound();

    return () => {
      controller.abort();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);

      cleanupHandlers?.();
    };
  }, [isHost, gameState.value.currentRound]);

  return (
    <div
      id="game-arena"
      className="centered"
    >
      {currentPhase.value !== PlayingViewPhase.PLAYING && (
        <div id="countdown-overlay">
          {currentPhase.value === PlayingViewPhase.SETUP && (
            <div
              id="countdown-text"
              className="countdown"
            >
              Ready?
            </div>
          )}
          {currentPhase.value === PlayingViewPhase.COUNTDOWN && (
            <div
              id="countdown-number"
              className="countdown"
            >
              {countdownValue.value}
            </div>
          )}
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
                    src={activeTrackInfo.value.gameCover || '/default.svg'}
                    alt={`Cover of ${activeTrackInfo.value.correctAnswer}`}
                    onError={e => {
                      (e.currentTarget as HTMLImageElement).src = '/default.svg';
                    }}
                  />
                  <div>
                    <p>
                      <strong>{activeTrackInfo.value.correctAnswer}</strong>
                    </p>
                    <p>
                      <i>{activeTrackInfo.value.trackTitle}</i>
                    </p>
                    <div className="tags-container left">
                      {activeTrackInfo.value.tags.map((tag: Tag) => (
                        <TooltipDiv
                          text={capitalize(tag.type)}
                          className="tag-badge"
                        >
                          <span key={tag.type}>{tag.value}</span>
                        </TooltipDiv>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <h2>Waiting for players to submit their guesses...</h2>
            </div>
          ) : (
            <LoadingSpinner />
          )}
        </div>
      ) : (
        <div id="game-guesser-ui">
          {isSelectingSpyTarget.value && (
            <div className="hint-container">
              <h2>Pick a player to spy on:</h2>
              <hr className="divider" />
              <div className="spy-hint-player-list">
                {gameState.value.guessedPlayers.filter(id => id !== getUserId(auth)).length === 0 ? (
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
                        <DiscordAvatar
                          src={getAvatarUrl(user)}
                          userName={getDisplayName(user)}
                        />
                        <span>{getDisplayName(user)}</span>
                      </button>
                    );
                  })
                )}
              </div>
              <button onClick={() => (isSelectingSpyTarget.value = false)}>Cancel</button>
            </div>
          )}

          {activeHint.value && !hasSubmitted.value && (
            <div className="hint-container">{renderJokerHint(activeHint.value, submitGuess)}</div>
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
                onSubmit={async e => {
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
                  maxLength={MAX_GUESS_LENGTH}
                />
                <button
                  type="submit"
                  id="btn-submit"
                >
                  Submit Guess
                </button>
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
                    const jokerName = capitalize(Icon.jokerType);

                    // Construct the tooltip text
                    const tooltipText = isAvailable ? jokerName : `${jokerName} (Already Used)`;

                    useKeyboardShortcut(
                      {
                        key: (index + 1).toString(),
                        altKey: !isMac,
                        metaKey: isMac,
                      },
                      () => {
                        if (isAvailable && !hasUsedJokerThisRound) {
                          void handleJokerUsage(type);
                        }
                      }
                    );

                    return (
                      <div
                        key={type}
                        className="joker-btn-wrapper"
                      >
                        <WithTooltip text={tooltipText}>
                          <button
                            className="joker-icon-btn"
                            id={`btn-joker-${type.toLowerCase().replace(/_/g, '-')}`}
                            onClick={() => handleJokerUsage(type)}
                            disabled={!isAvailable || hasUsedJokerThisRound}
                          >
                            <Icon />
                          </button>
                        </WithTooltip>

                        <span className="shortcut-badge">
                          <kbd>{getActionKeyLabel(isMac)}</kbd>+<kbd>{index + 1}</kbd>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="waiting-container">
              <p
                className="waiting-msg"
                id="waiting-msg"
              >
                Guess submitted! Waiting for others...
              </p>
            </div>
          )}
        </div>
      )}

      <div id="progress-container">
        <div
          id="progress-bar"
          ref={progressBarRef}
        ></div>
      </div>
    </div>
  );
};
