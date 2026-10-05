import { getAvatarUrl, getDisplayName, Participant } from '@yasq/shared';
import { findUser, getGameDuration } from '../../utils/helper';
import { DiscordAvatar } from './DiscordAvatar';

export const GameStatsSummary = ({ stats, participants }: { stats: any; participants: Participant[] }) => {
  const highestTimeBonus = stats.bestScoringRound?.timeBonusSum ?? 0;
  const leastTimeBonus = stats.leastScoringRound?.timeBonusSum ?? 0;

  const highestStreakUsers = stats.highestStreak?.userIds
    ? stats.highestStreak.userIds.map((id: string) => findUser(participants, id)).filter(Boolean)
    : [];

  const fastestCorrectGuessUser = stats.fastestCorrectGuess
    ? findUser(participants, stats.fastestCorrectGuess.roundResults.userId)
    : null;

  const statItems = [
    {
      label: 'Duration',
      users: [],
      value: getGameDuration(stats.startTime, stats.endTime),
    },
    {
      label: 'Best Round',
      users: [],
      value: stats.bestScoringRound ? `Round ${stats.bestScoringRound.roundResults[0]?.round || 'N/A'}` : 'N/A',
      subValue: `${highestTimeBonus} pts`,
    },
    {
      label: 'Least Round',
      users: [],
      value: stats.leastScoringRound ? `Round ${stats.leastScoringRound.roundResults[0]?.round || 'N/A'}` : 'N/A',
      subValue: `${leastTimeBonus} pts`,
    },
    {
      label: 'Highest Streak',
      users: highestStreakUsers,
      value: highestStreakUsers.map((u: Participant) => getDisplayName(u)),
      subValue: stats.highestStreak ? `🔥 ${stats.highestStreak.streak}` : '',
    },
    {
      label: 'Fastest Correct Guess',
      users: fastestCorrectGuessUser ? [fastestCorrectGuessUser] : [],
      value: fastestCorrectGuessUser ? [getDisplayName(fastestCorrectGuessUser)] : ['None'],
      subValue: stats.fastestCorrectGuess
        ? `${stats.fastestCorrectGuess.roundResults.time || 'N/A'}s (Round ${stats.fastestCorrectGuess.roundResults.round || 'N/A'})`
        : '',
    },
  ];

  return (
    <div className="game-stats">
      <h2>📊 Game Highlights</h2>
      <div className="game-stats-grid">
        {statItems.map((item, index) => {
          const users = item.users || [];
          const values = Array.isArray(item.value) ? item.value : [item.value];

          return (
            <div
              key={index}
              className="game-stat-item"
            >
              <span className="game-stat-label">{item.label}</span>
              {users.length > 0 ? (
                users.map((user: Participant, uIndex: number) => {
                  const userName = getDisplayName(user);
                  const avatarUrl = getAvatarUrl(user);
                  const displayValue = values[uIndex] || userName;
                  return (
                    <div
                      key={uIndex}
                      className="game-stat-content"
                    >
                      <DiscordAvatar
                        src={avatarUrl}
                        userName={userName}
                        tiny={true}
                        hasTooltip={false}
                      />
                      <strong className="game-stat-value">{displayValue}</strong>
                    </div>
                  );
                })
              ) : (
                <div className="game-stat-content">
                  <strong className="game-stat-value">{item.value}</strong>
                </div>
              )}
              {item.subValue && <span className="game-stat-subvalue">{item.subValue}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
