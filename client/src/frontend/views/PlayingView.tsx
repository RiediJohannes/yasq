import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';

import {
  capitalize,
  getAvatarUrl,
  getDisplayName,
  Joker,
  LogLevel,
  MAX_GUESS_LENGTH,
  Playback,
  RoundTimings,
  Tag,
} from '@yasq/shared';

import { audioPlayer, gameStatus, isMac, participants, useBackend } from '@yasq/client/src/globals';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';
import { getSyncedServerTime } from '../../backend/timing';
import { findUser, getActionKeyLabel } from '../../utils/helper';

import { ALL_JOKER_ICONS } from '@components/Icons';
import { NonDraggableImg } from '@components/NonDraggableImg';
import { DiscordAvatar } from '@components/DiscordAvatar';
import { TooltipDiv, WithTooltip } from '@components/Tooltip';
import { LoadingSpinner } from '@components/LoadingSpinner';

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
  const backend = useBackend();
  const hasSubmitted = useSignal(false);
  const isAudioBuffered = useSignal(false);

  // Phases: SETUP ("Ready?") -> COUNTDOWN (3, 2, 1) -> PLAYING
  const currentViewPhase = useSignal<PlayingViewPhase>(PlayingViewPhase.SETUP);
  const countdownValue = useSignal<number>(3);

  const inputRef = useRef<HTMLInputElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const setupControllerRef = useRef<AbortController | null>(null);

  const jokerError = useSignal<string | null>(null);
  const activeHint = useSignal<JokerHint | null>(null);
  const availableJokers = useSignal<string[]>([]);
  const isSelectingSpyTarget = useSignal(false);
  const activeTrackInfo = useSignal<any>(null);

  useEffect(() => {
    if (isHost) return;
    backend.getAvailableJokers().then(data => {
      availableJokers.value = data.available;
    });
  }, [gameStatus.value.state.round, isHost]);

  const handleJokerUsage = async (jokerType: Joker, targetId?: string) => {
    if (jokerType === Joker.SPY && !targetId) {
      isSelectingSpyTarget.value = true;
      return;
    }

    try {
      const response = await backend.useJoker(jokerType, targetId);
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
    await backend.submitGuess(guess, getSyncedServerTime());
  };

  // Autofocus input when playing phase starts
  useEffect(() => {
    if (currentViewPhase.value === PlayingViewPhase.PLAYING && !isHost && !hasSubmitted.value && inputRef.current) {
      inputRef.current?.focus();
    }
  }, [isHost, currentViewPhase.value, inputRef.current]);

  const bufferAudio = (url: string, abortSignal: AbortSignal): Promise<void> => {
    // Check if correct track is already loaded
    if (audioPlayer.src === url && audioPlayer.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      isAudioBuffered.value = true;
      return Promise.resolve();
    } else {
      isAudioBuffered.value = false;
    }

    // Preload audio buffer
    audioPlayer.src = url;
    audioPlayer.load();

    return new Promise<void>((resolve, reject) => {
      // Check if the audio player has already finished buffering
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
        isAudioBuffered.value = true;

        resolve();
      };

      const handleAbort = () => {
        if (settled) return;
        settled = true;

        clearTimeout(fallback);
        audioPlayer.removeEventListener('canplaythrough', handleCanPlay);
        isAudioBuffered.value = false;

        reject(new DOMException('Aborted', 'AbortError'));
      };

      const handleCanPlay = () => done();
      const fallback = setTimeout(done, 5000);

      audioPlayer.addEventListener('canplaythrough', handleCanPlay);
      abortSignal.addEventListener('abort', handleAbort, { once: true });
    });
  };

  // Request track data, pre-buffer audio track, then notify server
  const setupRound = async (abortSignal: AbortSignal) => {
    const setupStartTime = performance.now();

    try {
      const trackData = await backend.getCurrentTrack();
      if (!trackData || !trackData.url || abortSignal.aborted) return;

      if (isHost) activeTrackInfo.value = trackData;

      // Pre-buffer the track
      await bufferAudio(window.location.origin + trackData.url, abortSignal);
      if (abortSignal.aborted) return;

      // Notify the server that we are ready to start the round now
      await backend.updateReadyToPlayStatus(
        gameStatus.value.state.round,
        isAudioBuffered.value,
        performance.now() - setupStartTime
      );
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('Round setup error:', err);
    } finally {
      // Setup is no longer in flight (unless a newer run has already replaced us)
      if (setupControllerRef.current?.signal === abortSignal) {
        setupControllerRef.current = null;
      }
    }
  };

  const startSetup = async () => {
    setupControllerRef.current?.abort(); // cancel any previous setup run

    const setupController = new AbortController();
    setupControllerRef.current = setupController;

    await setupRound(setupController.signal);
  };

  // Initialize round (load audio track and send ready event)
  useEffect(() => {
    if (hasSubmitted.value) return;

    // Ensure audio player is immediately halted when entering/switching rounds
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer.src = '';

    isAudioBuffered.value = false;
    currentViewPhase.value = PlayingViewPhase.SETUP;

    void startSetup();

    return () => {
      setupControllerRef.current?.abort();
      setupControllerRef.current = null;
    };
  }, [isHost, gameStatus.value.state.round]);

  // Animate countdown and progress bar according to the timing specified in `activePlayback`
  const scheduleAnimationLoop = (activePlayback: Playback, abortSignal: AbortSignal): number => {
    let animationFrameId: number;
    const { startTime, endTime } = activePlayback;
    const totalDurationMillis = endTime - startTime;

    const animateCountdownAndProgressBar = (_currentFrameStart: DOMHighResTimeStamp) => {
      if (abortSignal.aborted) return;

      const now = getSyncedServerTime();
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

        if (remainingMilliseconds <= RoundTimings.COUNTDOWN_DURATION) {
          // Only now start the numbered countdown
          currentViewPhase.value = PlayingViewPhase.COUNTDOWN;

          const remainingSeconds = Math.ceil(remainingMilliseconds / 1000);
          countdownValue.value = Math.max(1, Math.min(RoundTimings.COUNTDOWN_DURATION / 1000, remainingSeconds));
        } else {
          currentViewPhase.value = PlayingViewPhase.SETUP;
        }
      } else {
        // Play track and animate progress bar
        currentViewPhase.value = PlayingViewPhase.PLAYING;

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
          audioPlayer.play().catch(async () => backend.logToServer(LogLevel.ERROR, 'Failed to play track'));
        }
      }

      // Register self to be called again on the next animation frame
      animationFrameId = requestAnimationFrame(animateCountdownAndProgressBar);
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(animateCountdownAndProgressBar);
    return animationFrameId;
  };

  // Start timed countdown/progressBar animation loop once Playback data becomes available
  useEffect(() => {
    // Only start animation loop once playback information exists and audio is fully buffered
    const activePlayback = gameStatus.value.state.playback;
    if (!activePlayback) return;

    if (!isAudioBuffered.value) {
      if (!setupControllerRef.current) {
        void startSetup(); // manually trigger setup
      }
      return;
    }

    const controller = new AbortController();
    const animationFrameId = scheduleAnimationLoop(activePlayback, controller.signal);

    return () => {
      // Stop the current animation loop
      controller.abort();
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [gameStatus.value.state.playback, isAudioBuffered.value]);

  return (
    <div
      id="game-arena"
      className="centered"
    >
      {currentViewPhase.value !== PlayingViewPhase.PLAYING && (
        <div id="countdown-overlay">
          {currentViewPhase.value === PlayingViewPhase.SETUP && (
            <div
              id="countdown-text"
              className="countdown"
            >
              Ready?
            </div>
          )}
          {currentViewPhase.value === PlayingViewPhase.COUNTDOWN && (
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
                {gameStatus.value.guessedPlayers.filter(id => id !== backend.userId).length === 0 ? (
                  <p className="no-results">No player has submitted a guess yet.</p>
                ) : (
                  gameStatus.value.guessedPlayers.map(targetId => {
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
                  .filter(Icon => gameStatus.value.settings.enabledJokers.includes(Icon.jokerType))
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
