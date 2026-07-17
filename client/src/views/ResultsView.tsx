import { useSignal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";

import * as backend from "../utils/backend";
import { auth, discordSdk, gameState, isMac, participants } from "../main";
import { capitalize, findUser, getActionKeyLabel, getUserId } from "../utils/helper";
import { NonDraggableImg } from "../components/NonDraggableImg";
import { useKeyboardShortcut } from "../hooks/useKeyboardShortcut";
import { Tag } from "../utils/types";
import { getAvatarUrl, getDisplayName, Participant } from "@yasq/shared";
import { RoundBubblesGroup } from "../components/RoundBubble";
import { PointsCalculationTable } from "../components/PointsCalculationTable";
import { RollingNumber } from "../components/RollingNumber";
import { DiscordAvatar, DiscordAvatarWithTooltip } from "../components/DiscordAvatar";

export const RoundResultsView = ({ isHost }: { isHost: boolean }) => {
  const roundData = useSignal<any>(null);
  const isPointsDetailsOpen = useSignal(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const handleReady = async () => {
    setHasInteracted(true);

    await backend.updateReadyStatus(
      auth.value.access_token,
      discordSdk.instanceId,
      !gameState.value.readyUsers.includes(getUserId(auth.value))
    )
  };

  const isFinalRound = gameState.value.currentRound >= gameState.value.gameSettings.rounds;

  useKeyboardShortcut({ key: "R", altKey: !isMac, metaKey: isMac }, () => {
    if (!isHost) void handleReady();
  });

  useEffect(() => {
    backend.getRoundResults(discordSdk.instanceId, getUserId(auth.value))
      .then(data => {
        roundData.value = data;
      })
      .catch(err => {
        if (err.status === 403) {
          roundData.value = { error: "NOT_FOUND" };
        } else {
          roundData.value = { error: "SERVER_ERROR" };
        }
      });
  }, [isHost]);

  // Logic for the Host's "Next Round" button
  const playersExcludingHost = participants.value.filter(p => p.id !== gameState.value.hostId);
  const readyCount = gameState.value.readyUsers.length;
  const allPlayersReady = playersExcludingHost.length > 0 &&
                          playersExcludingHost.every(p => gameState.value.readyUsers.includes(p.id));

  const handleNextRound = async () => {
    await backend.startNextRound(auth.value.access_token, discordSdk.instanceId);
  };

  if (!roundData.value) {
    return (
      <div className="centered">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (isHost) {
    const results = roundData.value.result || [];

    return (
      <div id="results" className="centered">
        <div className="card-container">
          <h2>Results</h2>
          <hr className="divider" />
          <div className="track-details">
            <NonDraggableImg
              src={roundData.value.gameCover || '/game_covers/default.svg'}
              alt={`Cover of ${roundData.value.correctAnswer}`}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/game_covers/default.svg'; }}
            />
            <div>
              <p><strong>{roundData.value.correctAnswer}</strong></p>
              <p><i>{roundData.value.trackTitle}</i></p>
              <div className="tags-container left">
                {roundData.value.tags.map((tag: Tag) => (
                  <span key={tag.type} title={capitalize(tag.type)} className="tag-badge">
                    {tag.value}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <hr className="divider" />
          <div>
            {results
              .filter((res: any) => res.points !== null)
              .map((res: any) => {
                const user = findUser(participants.value, res.userId);

                return (
                  <div key={res.userId} className="player-result">
                    <DiscordAvatar src={getAvatarUrl(user)} userName={getDisplayName(user)} />
                    <div className="name">{getDisplayName(user)}</div>

                    <div className="round-result-box">
                      <RoundBubblesGroup
                        rounds={[res]}
                        userId={res.userId}
                      />
                      <span className="time-display">
                        {res.time}s
                      </span>
                    </div>
                  </div>
                );
              })
            }
            {roundData.value.lostStreaks && Object.keys(roundData.value.lostStreaks).length > 0 && (
              <p>
                Lost Streaks: <strong>
                  {Object.entries(roundData.value.lostStreaks)
                    .map(([userId, streak]) => `${getDisplayName(findUser(participants.value, userId))} (${streak})`)
                    .join(', ')}
                </strong>
              </p>
            )}
          </div>
        </div>

        <div id="lobby-host-ui-next-round">
          <button
            id="btn-next-round"
            disabled={!allPlayersReady}
            onClick={handleNextRound}
          >
            {allPlayersReady
              ? (isFinalRound ? "Show Final Results" : "Next Round")
              : `Waiting... (${readyCount}/${playersExcludingHost.length})`
            }
          </button>
        </div>
      </div>
    );
  }

  if (roundData.value.error) {
    return (
      <div id="results" className="centered">
        <h2>Results Unavailable</h2>
        <p className="error-text">
          {roundData.value.error === "NOT_FOUND"
            ? "You weren't in the leaderboard for this round."
            : "A server error occurred."}
        </p>

        <div className='shortcut-badge-btn-wrapper'>
          <button
            className={`ready-btn ${gameState.value.readyUsers.includes(getUserId(auth.value)) ? 'ready' : ''} ${hasInteracted ? 'interacted' : ''}`}
            id="btn-ready"
            onClick={handleReady}
          >
            {gameState.value.readyUsers.includes(getUserId(auth.value))
              ? "I'm Ready! ✅" :
              (isFinalRound ? "Ready for Final Results" : "Ready for Next Round")
            }
          </button>
          <span className="shortcut-badge">
            <kbd>{getActionKeyLabel(isMac)}</kbd>+<kbd>R</kbd>
          </span>
        </div>
      </div>
    );
  }

  const userResult = roundData.value.result[0]
  const score = userResult?.scoreValue || 0;

  // Determine status class and message
  const { statusClass, statusMessage } = (() => {
    if (score === 1) return { statusClass: 'correct', statusMessage: 'Correct! 🎉' };
    if (score > 0) return { statusClass: 'partial', statusMessage: 'So close! 🧗' };
    return { statusClass: 'incorrect', statusMessage: 'Incorrect. 😢' };
  })();

  const correctPlayerIds = roundData.value?.correctPlayers || [];
  const participantLookup = new Map(participants.value.map(p => [p.id, p]));

  const correctParticipants: Participant[] = correctPlayerIds
    .map((id: string) => participantLookup.get(id))
    .filter((p: any): p is Participant => !!p);

  return (
    <div id="results" className="centered">
      <div className="card-container">
        <h2>Results</h2>
        <hr className="divider" />
        <div className="track-details">
          <NonDraggableImg
            src={roundData.value.gameCover || '/game_covers/default.svg'}
            alt={`Cover of ${roundData.value.correctAnswer}`}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/game_covers/default.svg'; }}
          />
          <div>
            <p><strong>{roundData.value.correctAnswer}</strong></p>
            <p><i>{roundData.value.trackTitle}</i></p>
            <div id="tags" className="tags-container left">
              {roundData.value.tags.map((tag: Tag) => (
                <span key={tag.type} title={capitalize(tag.type)} className="tag-badge">
                  {tag.value}
                </span>
              ))}
            </div>
          </div>
        </div>
        <hr className="divider" />
        <div id="own-results" className="own-results">
          <p className={`result ${statusClass}`}>
            {statusMessage}
          </p>
          <div className="user-evaluation">
            <div className="user-guess-wrapper">
              <span className="guess-label">Your guess:</span>
              <span id="guess" className="user-guess guess-text">{userResult?.guess || 'No guess submitted'}</span>
            </div>
            <div id="score" className="points-bubble">
              <RollingNumber target={userResult?.points || 0} /> pt.
            </div>
          </div>
          <div id="correct-players" className="correct-players">
            <span className="correct-players-label">Correct players ({correctParticipants.length}):</span>
            <div className="correct-players-list">
              {correctParticipants.length === 0 ? (
                <span className="correct-players-empty">Nobody got it fully correct!</span>
              ) : (
                correctParticipants.map((p: Participant) => (
                  <DiscordAvatarWithTooltip
                    userId={p.id}
                    src={getAvatarUrl(p)}
                    userName={getDisplayName(p)}
                  />
                ))
              )}
            </div>
          </div>
          {roundData.value.lostStreaks && Object.keys(roundData.value.lostStreaks).length > 0 && (
            <span>
              Lost Streaks: <strong>
                {Object.entries(roundData.value.lostStreaks)
                  .map(([userId, streak]) => `${getDisplayName(findUser(participants.value, userId))} (${streak})`)
                  .join(', ')}
              </strong>
            </span>
          )}
          {userResult.points > 0 && (
            <div id="score-details">
              <button
                type="button"
                id="score-details-btn"
                className="toggle-btn score-details-btn"
                onClick={() => (isPointsDetailsOpen.value = !isPointsDetailsOpen.value)}
              >
                <span>{isPointsDetailsOpen.value ? "Hide score details" : "See score details"}</span>
                <span className={`arrow-indicator ${isPointsDetailsOpen.value ? "open" : ""}`} />
              </button>

              {isPointsDetailsOpen.value && (
                <div className="score-details-panel">
                  <h3 className="points-table-heading">Points calculation:</h3>
                  <div className="center-box">
                    <PointsCalculationTable baseMultiplier={userResult?.scoreValue} awardedBonuses={userResult?.awardedBonuses || []} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className='shortcut-badge-btn-wrapper'>
        <button
          className={`ready-btn ${gameState.value.readyUsers.includes(getUserId(auth.value)) ? 'ready' : ''} ${hasInteracted ? 'interacted' : ''}`}
          id="btn-ready"
          onClick={handleReady}
        >
          {gameState.value.readyUsers.includes(getUserId(auth.value))
            ? "I'm Ready! ✅" :
            (isFinalRound ? "Ready for Final Results" : "Ready for Next Round")
          }
        </button>
        <span className="shortcut-badge">
          <kbd>{getActionKeyLabel(isMac)}</kbd>+<kbd>R</kbd>
        </span>
      </div>
    </div>
  );
};