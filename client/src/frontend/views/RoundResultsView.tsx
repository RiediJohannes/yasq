import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

import {
  capitalize,
  Fallible,
  getAvatarUrl,
  getDisplayName,
  Participant,
  RoundDataDto,
  RoundResultDto,
  Tag,
} from '@yasq/shared';
import { gameStatus, participants, useBackend } from '@globals';

import { NonDraggableImg } from '@components/NonDraggableImg';
import { RoundBubblesGroup } from '@components/RoundBubble';
import { PointsCalculationTable } from '@components/PointsCalculationTable';
import { RollingNumber } from '@components/RollingNumber';
import { DiscordAvatar } from '@components/DiscordAvatar';
import { TimeBonusPlot } from '@components/TimeBonusPlot';
import { ReadyButton } from '@components/ReadyButton';
import { TooltipDiv } from '@components/Tooltip';
import { LoadingSpinner } from '@components/LoadingSpinner';

import { findUser, getStreakTier } from '../../utils/helper';

export const RoundResultsView = ({ isHost }: { isHost: boolean }) => {
  const backend = useBackend();
  const roundData = useSignal<Fallible<RoundDataDto> | null>(null);
  const isPointsDetailsOpen = useSignal(false);

  const isFinalRound = gameStatus.value.state.round >= gameStatus.value.settings.rounds;
  const hasTimeBonus = !!gameStatus.value.settings.timeBonus;

  useEffect(() => {
    backend
      .getRoundResults()
      .then((data: Fallible<RoundDataDto>) => {
        roundData.value = data;
      })
      .catch(_ => {
        roundData.value = { error: 'SERVER_ERROR' } as Fallible<RoundDataDto>;
      });
  }, [isHost]);

  // Logic for the Host's "Next Round" button
  const playersExcludingHost = participants.value.filter(p => p.id !== gameStatus.value.hostId);
  const currentPlayer = findUser(participants.value, backend.userId);
  const readyCount = gameStatus.value.readyPlayers.length;
  const allPlayersReady =
    playersExcludingHost.length > 0 && playersExcludingHost.every(p => gameStatus.value.readyPlayers.includes(p.id));

  const handleNextRound = async () => {
    await backend.startNextRound();
  };

  if (!roundData.value) {
    return <LoadingSpinner />;
  }

  if (!roundData.value.ok) {
    return (
      <div
        id="results"
        className="centered"
      >
        <h2>Results Unavailable</h2>
        <p className="error-text">
          {roundData.value.error === 'SERVER_ERROR' ? 'A server error occurred.' : 'An unexpected error occurred.'}
        </p>
        <ReadyButton />
      </div>
    );
  }

  // TODO Remove test data
  roundData.value.lostStreaks = {
    1: 1,
    2: 3,
  };

  const results: RoundResultDto[] = roundData.value.result || [];
  const userResult = results[0];
  const score = userResult?.scoreValue || 0;
  const needsScoreDetails = userResult && (hasTimeBonus || userResult.points > 0);

  // Determine status class and message
  const { statusClass, statusMessage } = (() => {
    if (score === 1) return { statusClass: 'correct', statusMessage: 'Correct! 🎉' };
    if (score > 0) return { statusClass: 'partial', statusMessage: 'So close! 🧗' };
    return { statusClass: 'incorrect', statusMessage: 'Incorrect. 😢' };
  })();

  const correctPlayerIds = roundData.value?.correctPlayers || [];
  const correctParticipants: Participant[] = participants.value.filter(p => correctPlayerIds.includes(p.id));

  const lostStreaks = roundData.value.lostStreaks ? Object.entries(roundData.value.lostStreaks) : [];

  return (
    <div
      id="results"
      className="centered"
    >
      <div className="card-container">
        <h2>Results</h2>
        <hr className="divider" />

        <div className="track-details">
          <NonDraggableImg
            src={roundData.value.gameCover || '/default.svg'}
            alt={`Cover of ${roundData.value.correctAnswer}`}
            onError={e => {
              (e.currentTarget as HTMLImageElement).src = '/default.svg';
            }}
          />
          <div>
            <p>
              <strong>{roundData.value.correctAnswer}</strong>
            </p>
            <p>
              <i>{roundData.value.trackTitle}</i>
            </p>
            <div
              id="tags"
              className="tags-container left"
            >
              {roundData.value.tags.map((tag: Tag) => (
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

        <hr className="divider" />

        {isHost ? (
          <div>
            {results
              .filter((res: any) => res.points !== null)
              .map((res: any) => {
                const user = findUser(participants.value, res.userId);

                return (
                  <div
                    key={res.userId}
                    className="player-result"
                  >
                    <DiscordAvatar
                      src={getAvatarUrl(user)}
                      userName={getDisplayName(user)}
                    />
                    <div className="name">{getDisplayName(user)}</div>

                    <div className="round-result-box">
                      <RoundBubblesGroup
                        rounds={[res]}
                        userId={res.userId}
                      />
                      <span className="time-display">{res.time.toFixed(1)}s</span>
                    </div>
                  </div>
                );
              })}
            {/*{ TODO Update styles of lost streaks list on host view too */}
            {lostStreaks.length > 0 && (
              <p>
                Lost Streaks:{' '}
                <strong>
                  {lostStreaks
                    .map(([userId, streak]) => `${getDisplayName(findUser(participants.value, userId))} (${streak})`)
                    .join(', ')}
                </strong>
              </p>
            )}
            {hasTimeBonus && (
              <div id="host-details">
                <hr className="divider" />
                <div className="host-details-panel">
                  <h3 className="section-heading time-bonus-heading">Time bonus calculation:</h3>
                  <div className="center-box">
                    <TimeBonusPlot
                      currentPlayer={currentPlayer}
                      participants={participants.value}
                      data={roundData.value.summary?.timeBonusSummary ?? null}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            id="own-results"
            className="own-results"
          >
            {userResult ? (
              <>
                <p className={`user-guess-result ${statusClass}`}>{statusMessage}</p>
                <div className="user-evaluation">
                  <div className="user-guess-wrapper">
                    <span className="guess-label">Your guess:</span>
                    <span
                      id="guess"
                      className="user-guess guess-text"
                    >
                      {userResult?.guess || 'No guess submitted'}
                    </span>
                  </div>
                  <div
                    id="score"
                    className="points-bubble"
                  >
                    <RollingNumber target={userResult?.points || 0} /> pt.
                  </div>
                </div>
              </>
            ) : (
              <p className="info-message leaderboard-absent-message">You were not in the leaderboard for this round.</p>
            )}

            <div
              id="correct-players"
              className="inline-players"
            >
              <span className="inline-players-label">Correct players ({correctParticipants.length}):</span>
              <div className="inline-players-list">
                {correctParticipants.length === 0 ? (
                  <span className="inline-players-empty">Nobody got it fully correct!</span>
                ) : (
                  correctParticipants.map((p: Participant) => (
                    <DiscordAvatar
                      src={getAvatarUrl(p)}
                      userName={getDisplayName(p)}
                      hasTooltip={true}
                    />
                  ))
                )}
              </div>
            </div>

            {lostStreaks.length > 0 && (
              <div
                id="lost-streaks"
                className="inline-players"
              >
                <span className="inline-players-label">Lost Streaks ({lostStreaks.length}):</span>
                <div className="inline-players-list">
                  {lostStreaks
                    .sort(([_uidA, streakA], [_uidB, streakB]) => streakB - streakA)
                    .map(([userId, streak]) => {
                      const participant = findUser(participants.value, userId);

                      return (
                        <span
                          key={userId}
                          className="badged-player"
                          aria-label={`${getDisplayName(participant)} lost a ${streak}-streak`}
                        >
                          <DiscordAvatar
                            src={getAvatarUrl(participant)}
                            userName={getDisplayName(participant)}
                            hasTooltip={true}
                          />
                          <span className={`avatar-badge streak-tier-${getStreakTier(streak)}`}>{streak}</span>
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            {hasTimeBonus && !userResult && (
              <div id="host-details">
                <hr className="divider" />
                <div className="host-details-panel">
                  <h3 className="section-heading time-bonus-heading">Time bonus calculation:</h3>
                  <div className="center-box">
                    <TimeBonusPlot
                      currentPlayer={currentPlayer}
                      participants={participants.value}
                      data={roundData.value.summary?.timeBonusSummary ?? null}
                    />
                  </div>
                </div>
              </div>
            )}

            {needsScoreDetails && (
              <div id="score-details">
                <button
                  type="button"
                  id="score-details-btn"
                  className="toggle-btn score-details-btn"
                  onClick={() => (isPointsDetailsOpen.value = !isPointsDetailsOpen.value)}
                >
                  <span>{isPointsDetailsOpen.value ? 'Hide score details' : 'See score details'}</span>
                  <span className={`arrow-indicator ${isPointsDetailsOpen.value ? 'open' : ''}`} />
                </button>

                {isPointsDetailsOpen.value && (
                  <div className="score-details-panel">
                    {userResult.points > 0 && (
                      <>
                        <h3 className="section-heading points-table-heading">Points calculation:</h3>
                        <div className="center-box">
                          <PointsCalculationTable
                            baseMultiplier={userResult?.scoreValue}
                            awardedBonuses={userResult?.awardedBonuses || []}
                          />
                        </div>
                        <hr className="divider" />
                      </>
                    )}
                    {hasTimeBonus && (
                      <>
                        <h3 className="section-heading time-bonus-heading">Time bonus calculation:</h3>
                        <div className="center-box">
                          <TimeBonusPlot
                            currentPlayer={currentPlayer}
                            participants={participants.value}
                            data={roundData.value.summary?.timeBonusSummary ?? null}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isHost ? (
        <button
          id="btn-next-round"
          disabled={!allPlayersReady}
          onClick={handleNextRound}
        >
          {allPlayersReady
            ? isFinalRound
              ? 'Show Final Results'
              : 'Next Round'
            : `Waiting... (${readyCount}/${playersExcludingHost.length})`}
        </button>
      ) : (
        <ReadyButton />
      )}
    </div>
  );
};
