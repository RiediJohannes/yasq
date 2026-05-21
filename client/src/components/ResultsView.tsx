import { useSignal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";

import * as backend from "../utils/backend";
import { gameState, auth, discordSdk, participants } from "../main";
import { capitalize, getAvatarUrl, getDisplayName, getUserId } from "../utils/helper";

export const RoundResultsView = ({ isHost }: { isHost: boolean }) => {
  const roundData = useSignal<any>(null);

  const [hasInteracted, setHasInteracted] = useState(false);

  const handleReady = async () => {
    setHasInteracted(true);

    await backend.updateReadyStatus(
      auth.value.access_token,
      discordSdk.instanceId,
      !gameState.value.readyUsers.includes(getUserId(auth.value))
    )
  };

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
      <div class="centered">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (isHost) {
    const results = roundData.value.result || [];

    return (
      <div id="results" className="centered">
        <div className="round-result-summary">
          <h2>Results</h2>
          <hr className="divider" />
          <div className="track-details">
            <img
              src={roundData.value.gameCover || '/game_covers/default.svg'}
              alt={`Cover of ${roundData.value.correctAnswer}`}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/game_covers/default.svg'; }}
            />
            <div>
              <p><strong>{roundData.value.correctAnswer}</strong></p>
              <p><i>{roundData.value.trackTitle}</i></p>
              <div className="tags-container left">
                {roundData.value.tags.map((tag: any) => (
                  <span key={tag.type} title={capitalize(tag.type)} className="tag-badge">
                    {tag.value}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <hr className="divider" />
          <div>
            {results.map((res: any) => {
              const discordUser = participants.value.find(p => p.id === res.userId) ||
                                  { id: "0", username: 'Unknown' };

              return (
                <div key={res.userId} className="player-result">
                  <img src={getAvatarUrl(discordUser)} className="avatar-small" />
                  <div className="name">{getDisplayName(discordUser)}</div>

                  <div className="round-result-box">
                    <div className="round-bubbles">
                      <div
                        className={`round-bubble ${res.scoreValue > 0 ? 'correct' : 'incorrect'} ${res.isFirst ? 'first' : ''}`}
                        title={res.guess || 'No guess'}
                      >
                        {res.points}
                      </div>
                    </div>

                    <span className="time-display">
                      {res.time}s
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div id="lobby-host-ui-next-round">
          <button
            id="btn-next-round"
            disabled={!allPlayersReady}
            onClick={handleNextRound}
          >
            {allPlayersReady
              ? (gameState.value.isFinalRound ? "Show Final Results" : "Next Round")
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

        <div>
          <button
            className={`ready-btn ${gameState.value.readyUsers.includes(getUserId(auth.value)) ? 'ready' : ''} ${hasInteracted ? 'interacted' : ''}`}
            id="btn-ready"
            onClick={handleReady}
          >
            {gameState.value.readyUsers.includes(getUserId(auth.value)) ? "I'm Ready! ✅" : "Ready for Next Round"}
          </button>
        </div>
      </div>
    );
  }

  const score = roundData.value.result[0]?.scoreValue || 0;

  // Determine status class and message
  let statusClass = 'incorrect';
  let statusMessage = 'Incorrect. 😢';

  if (score === 1) {
    statusClass = 'correct';
    statusMessage = 'Correct! 🎉';
  } else if (score > 0) {
    statusClass = 'partial';
    statusMessage = 'So close! 🧗';
  }

  return (
    <div id="results" className="centered">
      <div className="round-result-summary">
        <h2>Results</h2>
        <hr className="divider" />
        <div className="track-details">
          <img
            src={roundData.value.gameCover || '/game_covers/default.svg'}
            alt={`Cover of ${roundData.value.correctAnswer}`}
            onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/game_covers/default.svg'; }}
          />
          <div>
            <p><strong>{roundData.value.correctAnswer}</strong></p>
            <p><i>{roundData.value.trackTitle}</i></p>
            <div className="tags-container left">
              {roundData.value.tags.map((tag: any) => (
                <span key={tag.type} title={capitalize(tag.type)} className="tag-badge">
                  {tag.value}
                </span>
              ))}
            </div>
          </div>
        </div>
        <hr className="divider" />
        <div className="own-results">
          <p className={`result ${statusClass}`}>
            {statusMessage}
          </p>
          <p>Your guess: <strong>{roundData.value.result[0]?.guess || 'No guess submitted'}</strong></p>
          <p>You earned <strong>
            <RollingNumber target={roundData.value.result[0]?.points || 0} />
          </strong> points this round.</p>
          <p>Number of correct players: {roundData.value.correctPlayers}</p>
        </div>
      </div>

      <div>
        <button
          className={`ready-btn ${gameState.value.readyUsers.includes(getUserId(auth.value)) ? 'ready' : ''} ${hasInteracted ? 'interacted' : ''}`}
          id="btn-ready"
          onClick={handleReady}
        >
          {gameState.value.readyUsers.includes(getUserId(auth.value)) ? "I'm Ready! ✅" : "Ready Up"}
        </button>
      </div>
    </div>
  );
};

export const RollingNumber = ({ target }: { target: number }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 2000; // 2 second animation
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (makes it slow down at the end)
      const easeOutQuad = (t: number) => t * (2 - t);
      const currentCount = Math.floor(easeOutQuad(progress) * target);

      setDisplayValue(currentCount);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target]);

  return <span>{displayValue}</span>;
};