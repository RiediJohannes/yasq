import { useSignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';

import * as backend from '../utils/backend';
import { discordSdk, participants, useAuth } from '../main';
import { findUser } from '../utils/helper';
import { ALL_JOKER_ICONS } from '../components/Icons';
import { ReviewData } from '../utils/types';
import { getAvatarUrl, getDisplayName } from '@yasq/shared';
import { DiscordAvatar } from '../components/DiscordAvatar';
import { TooltipDiv } from '../components/Tooltip';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { RadioGroup } from '../components/RadioGroup';

export const HostReviewView = ({ isHost }: { isHost: boolean }) => {
  const auth = useAuth();
  const reviewData = useSignal<ReviewData | null>(null);
  const corrections = useSignal<Record<string, number>>({});

  useEffect(() => {
    if (isHost) {
      backend.getGuesses(auth.access_token, discordSdk.instanceId).then(data => {
        reviewData.value = data;
        // Pre-populate corrections with 0 (Wrong) for everyone who guessed
        const initial: Record<string, number> = {};
        Object.keys(data.guesses).forEach(uid => (initial[uid] = 0));
        corrections.value = initial;
      });
    }
  }, [isHost]);

  if (!isHost) {
    return (
      <div
        id="results"
        className="centered"
      >
        <h2>Waiting for host to review answers...</h2>
      </div>
    );
  }

  if (!reviewData.value) {
    return <LoadingSpinner />;
  }

  const handleSubmit = async (e: MouseEvent) => {
    const btn = e.currentTarget as HTMLButtonElement;
    btn.disabled = true;
    await backend.submitRoundResults(auth.access_token, discordSdk.instanceId, corrections.value);
  };

  return (
    <div
      id="results"
      className="centered"
    >
      <h2>Results</h2>
      <p>
        The correct answer was: <strong>{reviewData.value.answer}</strong>
      </p>

      <div id="guess-list">
        {Object.entries(reviewData.value.guesses).map(([userId, guess]) => {
          const user = findUser(participants.value, userId);
          const displayName = user ? getDisplayName(user) : 'Unknown';
          const avatarUrl = user ? getAvatarUrl(user) : '';

          return (
            <div
              key={userId}
              className="guess-item"
            >
              <div className="user-info">
                <DiscordAvatar
                  src={avatarUrl}
                  userName={displayName}
                />
                <span className="username">{displayName}</span>
                <span className="correction-guess guess-text">{guess.text}</span>
                {guess.joker &&
                  (() => {
                    const JokerIcon = ALL_JOKER_ICONS.find(icon => icon.jokerType === guess.joker);
                    return JokerIcon ? (
                      <TooltipDiv
                        text={JokerIcon?.description}
                        className="joker-indicator"
                        role="img"
                      >
                        <JokerIcon />
                      </TooltipDiv>
                    ) : null;
                  })()}
              </div>

              <RadioGroup
                name={`score-${userId}`}
                value={corrections.value[userId]}
                onChange={val => {
                  corrections.value = { ...corrections.value, [userId]: val };
                }}
                options={[
                  { label: 'Wrong', value: 0, className: 'wrong', id: `wrong-${userId}` },
                  { label: 'Partial', value: 0.5, className: 'partial', id: `partial-${userId}` },
                  { label: 'Correct', value: 1, className: 'correct', id: `correct-${userId}` },
                ]}
              />
            </div>
          );
        })}
      </div>

      {reviewData.value.timedOut.length > 0 && (
        <div className="timed-out-section">
          <p>
            No Guess submitted:{' '}
            {reviewData.value.timedOut
              .map(id => {
                const user = findUser(participants.value, id);
                return user ? getDisplayName(user) : 'Unknown';
              })
              .join(', ')}
          </p>
        </div>
      )}

      <button
        id="btn-submit-reviewed-results"
        onClick={handleSubmit}
      >
        Submit Reviewed Results
      </button>
    </div>
  );
};
